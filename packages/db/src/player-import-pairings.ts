import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  applyWarframeApiHelperImport,
  type PlayerDataImportResult,
} from "./alecaframe-import.ts";

const PAIRING_LIFETIME_MS = 10 * 60_000;
const PAIRING_RETENTION_MS = 24 * 60 * 60_000;

export type PlayerImportPairingStatus =
  "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface PlayerImportPairing {
  id: string;
  status: PlayerImportPairingStatus;
  expiresAt: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: PlayerDataImportResult;
  error?: string;
}

export interface CreatedPlayerImportPairing extends PlayerImportPairing {
  pairingCode: string;
}

export function createPlayerImportPairing(
  sqlite: Database.Database,
  userId: string,
  baseUrl: string,
  now = Date.now(),
): CreatedPlayerImportPairing {
  const origin = secureOrigin(baseUrl);
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const expiresAt = now + PAIRING_LIFETIME_MS;
  sqlite.transaction(() => {
    prunePlayerImportPairings(sqlite, now);
    sqlite
      .prepare(
        `update player_import_pairings
         set status = 'cancelled', token_hash = null, finished_at = ?
         where user_id = ? and provider = 'warframe-api-helper'
           and status = 'pending'`,
      )
      .run(now, userId);
    sqlite
      .prepare(
        `insert into player_import_pairings
          (id, user_id, provider, token_hash, status, expires_at, created_at)
         values (?, ?, 'warframe-api-helper', ?, 'pending', ?, ?)`,
      )
      .run(id, userId, hashToken(token), expiresAt, now);
  })();
  return {
    id,
    status: "pending",
    expiresAt,
    createdAt: now,
    pairingCode: `ordis-prime:v1:${Buffer.from(origin).toString("base64url")}:${token}`,
  };
}

export function getPlayerImportPairing(
  sqlite: Database.Database,
  userId: string,
  id: string,
  now = Date.now(),
): PlayerImportPairing | undefined {
  expirePendingPairing(sqlite, id, now);
  const row = sqlite
    .prepare(
      `select id, status, expires_at as expiresAt, created_at as createdAt,
              started_at as startedAt, finished_at as finishedAt,
              result_json as resultJson, error
       from player_import_pairings where id = ? and user_id = ?`,
    )
    .get(id, userId) as PairingRow | undefined;
  return row ? hydrate(row) : undefined;
}

export function cancelPlayerImportPairing(
  sqlite: Database.Database,
  userId: string,
  id: string,
  now = Date.now(),
): boolean {
  return (
    sqlite
      .prepare(
        `update player_import_pairings
         set status = 'cancelled', token_hash = null, finished_at = ?
         where id = ? and user_id = ? and status = 'pending'`,
      )
      .run(now, id, userId).changes === 1
  );
}

export function applyPairedWarframeApiHelperImport(
  sqlite: Database.Database,
  token: string,
  bytes: Uint8Array,
  now = Date.now(),
): { pairingId: string; result: PlayerDataImportResult } {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new PairingImportError("Pairing code is invalid", 401);
  const claimed = sqlite.transaction(() => {
    const row = sqlite
      .prepare(
        `select id, user_id as userId from player_import_pairings
         where token_hash = ? and status = 'pending' and expires_at > ?`,
      )
      .get(hashToken(token), now) as { id: string; userId: string } | undefined;
    if (!row) return undefined;
    const changed = sqlite
      .prepare(
        `update player_import_pairings
         set status = 'running', token_hash = null, started_at = ?
         where id = ? and status = 'pending'`,
      )
      .run(now, row.id).changes;
    return changed === 1 ? row : undefined;
  })();
  if (!claimed)
    throw new PairingImportError(
      "Pairing code is expired or already used",
      401,
    );
  try {
    const result = sqlite.transaction(() => {
      const imported = applyWarframeApiHelperImport(
        sqlite,
        claimed.userId,
        bytes,
      );
      const changed = sqlite
        .prepare(
          `update player_import_pairings
           set status = 'succeeded', result_json = ?, finished_at = ?
           where id = ? and status = 'running'`,
        )
        .run(JSON.stringify(imported), Date.now(), claimed.id).changes;
      if (changed !== 1) throw new Error("Pairing state changed during import");
      return imported;
    })();
    return { pairingId: claimed.id, result };
  } catch (error) {
    const message = safeError(error);
    sqlite
      .prepare(
        `update player_import_pairings
         set status = 'failed', error = ?, finished_at = ?
         where id = ? and status = 'running'`,
      )
      .run(message, Date.now(), claimed.id);
    throw new PairingImportError(message, 400);
  }
}

export function prunePlayerImportPairings(
  sqlite: Database.Database,
  now = Date.now(),
): number {
  sqlite
    .prepare(
      `update player_import_pairings
       set status = 'failed', token_hash = null, error = 'Pairing code expired', finished_at = ?
       where status = 'pending' and expires_at <= ?`,
    )
    .run(now, now);
  return sqlite
    .prepare(
      `delete from player_import_pairings
       where coalesce(finished_at, expires_at) <= ?`,
    )
    .run(now - PAIRING_RETENTION_MS).changes;
}

export class PairingImportError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface PairingRow {
  id: string;
  status: PlayerImportPairingStatus;
  expiresAt: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  resultJson: string | null;
  error: string | null;
}

function hydrate(row: PairingRow): PlayerImportPairing {
  return {
    id: row.id,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    ...(row.startedAt === null ? {} : { startedAt: row.startedAt }),
    ...(row.finishedAt === null ? {} : { finishedAt: row.finishedAt }),
    ...(row.resultJson
      ? { result: JSON.parse(row.resultJson) as PlayerDataImportResult }
      : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

function expirePendingPairing(
  sqlite: Database.Database,
  id: string,
  now: number,
) {
  sqlite
    .prepare(
      `update player_import_pairings
       set status = 'failed', token_hash = null, error = 'Pairing code expired', finished_at = ?
       where id = ? and status = 'pending' and expires_at <= ?`,
    )
    .run(now, id, now);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function secureOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ORDIS_BASE_URL must be an absolute URL");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("Updater pairing requires HTTPS");
  return url.origin;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Import failed";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
