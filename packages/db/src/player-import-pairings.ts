import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  applyWarframeApiHelperImport,
  type PlayerDataImportResult,
} from "./alecaframe-import.ts";

const PAIRING_LIFETIME_MS = 10 * 60_000;
const PAIRING_RETENTION_MS = 24 * 60 * 60_000;
const PREVIOUS_DEVICE_TOKEN_GRACE_MS = 10 * 60_000;
const DEVICE_RATE_WINDOW_MS = 60 * 60_000;
const DEVICE_RATE_LIMIT = 12;
const DEVICE_EVENT_LIMIT = 100;

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

export interface PlayerImportDevice {
  id: string;
  name: string;
  status: "active" | "revoked";
  createdAt: number;
  lastUsedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  revokedAt?: number;
}

export interface WarframeUpdaterSyncRequest {
  token: string;
  nextToken: string;
  requestId: string;
  bytes: Uint8Array;
  deviceId?: string;
  deviceName?: string;
  now?: number;
}

export interface WarframeUpdaterSyncResult {
  deviceId: string;
  paired: boolean;
  replayed: boolean;
  result: PlayerDataImportResult;
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
    const recent = sqlite
      .prepare(
        `select count(*) as count from player_import_pairings
         where user_id = ? and provider = 'warframe-api-helper'
           and created_at > ?`,
      )
      .get(userId, now - DEVICE_RATE_WINDOW_MS) as { count: number };
    if (recent.count >= 5)
      throw new PairingImportError(
        "Too many updater pairings were created recently",
        429,
      );
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

export function applyWarframeUpdaterImport(
  sqlite: Database.Database,
  request: WarframeUpdaterSyncRequest,
): WarframeUpdaterSyncResult {
  const now = request.now ?? Date.now();
  validateToken(request.token, "Credential");
  validateToken(request.nextToken, "Replacement credential");
  if (request.token === request.nextToken)
    throw new PairingImportError("Replacement credential must be new", 400);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      request.requestId,
    )
  )
    throw new PairingImportError("Request identifier is invalid", 400);
  return request.deviceId
    ? applyDeviceSync(sqlite, request, now)
    : exchangePairing(sqlite, request, now);
}

function exchangePairing(
  sqlite: Database.Database,
  request: WarframeUpdaterSyncRequest,
  now: number,
): WarframeUpdaterSyncResult {
  const deviceName = normalizeDeviceName(request.deviceName);
  const claimed = sqlite.transaction(() => {
    const row = sqlite
      .prepare(
        `select id, user_id as userId from player_import_pairings
         where token_hash = ? and status = 'pending' and expires_at > ?`,
      )
      .get(hashToken(request.token), now) as
      { id: string; userId: string } | undefined;
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
    return sqlite.transaction(() => {
      const imported = applyWarframeApiHelperImport(
        sqlite,
        claimed.userId,
        request.bytes,
      );
      const compactResult = compactImportResult(imported);
      const deviceId = randomUUID();
      sqlite
        .prepare(
          `insert into player_import_devices
            (id, user_id, provider, name, token_hash, status, created_at,
             last_used_at, last_success_at, rate_window_started_at,
             rate_window_request_count, last_request_id,
             last_request_next_token_hash, last_response_json)
           values (?, ?, 'warframe-api-helper', ?, ?, 'active', ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          deviceId,
          claimed.userId,
          deviceName,
          hashToken(request.nextToken),
          now,
          now,
          now,
          now,
          request.requestId,
          hashToken(request.nextToken),
          JSON.stringify(compactResult),
        );
      recordDeviceEvent(sqlite, deviceId, "succeeded", request.requestId, now);
      const changed = sqlite
        .prepare(
          `update player_import_pairings
           set status = 'succeeded', result_json = ?, finished_at = ?
           where id = ? and status = 'running'`,
        )
        .run(JSON.stringify(compactResult), now, claimed.id).changes;
      if (changed !== 1) throw new Error("Pairing state changed during import");
      return {
        deviceId,
        paired: true,
        replayed: false,
        result: imported,
      };
    })();
  } catch (error) {
    const message = safeError(error);
    sqlite
      .prepare(
        `update player_import_pairings
         set status = 'failed', error = ?, finished_at = ?
         where id = ? and status = 'running'`,
      )
      .run(message, now, claimed.id);
    throw new PairingImportError(message, 400);
  }
}

function applyDeviceSync(
  sqlite: Database.Database,
  request: WarframeUpdaterSyncRequest,
  now: number,
): WarframeUpdaterSyncResult {
  if (!/^[0-9a-f-]{36}$/i.test(request.deviceId ?? ""))
    throw new PairingImportError("Device credential is invalid", 401);
  const tokenHash = hashToken(request.token);
  const nextTokenHash = hashToken(request.nextToken);
  try {
    return sqlite
      .transaction(() => {
        const device = sqlite
          .prepare(
            `select id, user_id as userId, token_hash as tokenHash,
                  previous_token_hash as previousTokenHash,
                  previous_valid_until as previousValidUntil, status,
                  rate_window_started_at as rateWindowStartedAt,
                  rate_window_request_count as rateWindowRequestCount,
                  last_request_id as lastRequestId,
                  last_request_next_token_hash as lastRequestNextTokenHash,
                  last_response_json as lastResponseJson
           from player_import_devices where id = ?`,
          )
          .get(request.deviceId) as DeviceAuthRow | undefined;
        if (!device || device.status !== "active")
          throw new PairingImportError("Device is revoked or unknown", 401);
        const replay =
          device.previousTokenHash === tokenHash &&
          (device.previousValidUntil ?? 0) > now &&
          device.lastRequestId === request.requestId &&
          device.lastRequestNextTokenHash === nextTokenHash &&
          device.tokenHash === nextTokenHash &&
          device.lastResponseJson;
        if (replay) {
          sqlite
            .prepare(
              "update player_import_devices set last_used_at = ? where id = ?",
            )
            .run(now, device.id);
          recordDeviceEvent(
            sqlite,
            device.id,
            "replayed",
            request.requestId,
            now,
          );
          return {
            deviceId: device.id,
            paired: false,
            replayed: true,
            result: JSON.parse(
              device.lastResponseJson!,
            ) as PlayerDataImportResult,
          };
        }
        if (device.tokenHash !== tokenHash)
          throw new PairingImportError("Device credential is invalid", 401);
        const windowStartedAt =
          now - device.rateWindowStartedAt >= DEVICE_RATE_WINDOW_MS
            ? now
            : device.rateWindowStartedAt;
        const requestCount =
          windowStartedAt === now ? 1 : device.rateWindowRequestCount + 1;
        if (requestCount > DEVICE_RATE_LIMIT)
          throw new PairingImportError(
            "Device synchronization rate limit exceeded",
            429,
          );
        const imported = applyWarframeApiHelperImport(
          sqlite,
          device.userId,
          request.bytes,
        );
        const responseJson = JSON.stringify(compactImportResult(imported));
        const changed = sqlite
          .prepare(
            `update player_import_devices set
             token_hash = ?, previous_token_hash = ?, previous_valid_until = ?,
             last_used_at = ?, last_success_at = ?, last_error = null,
             rate_window_started_at = ?, rate_window_request_count = ?,
             last_request_id = ?, last_request_next_token_hash = ?,
             last_response_json = ?
           where id = ? and status = 'active' and token_hash = ?`,
          )
          .run(
            nextTokenHash,
            tokenHash,
            now + PREVIOUS_DEVICE_TOKEN_GRACE_MS,
            now,
            now,
            windowStartedAt,
            requestCount,
            request.requestId,
            nextTokenHash,
            responseJson,
            device.id,
            tokenHash,
          ).changes;
        if (changed !== 1)
          throw new PairingImportError("Device credential changed", 409);
        recordDeviceEvent(
          sqlite,
          device.id,
          "succeeded",
          request.requestId,
          now,
        );
        return {
          deviceId: device.id,
          paired: false,
          replayed: false,
          result: imported,
        };
      })
      .immediate();
  } catch (error) {
    if (error instanceof PairingImportError && error.status === 401)
      throw error;
    const message = safeError(error);
    const matching = sqlite
      .prepare(
        `select id from player_import_devices
         where id = ? and status = 'active' and token_hash = ?`,
      )
      .get(request.deviceId, tokenHash) as { id: string } | undefined;
    if (matching)
      sqlite.transaction(() => {
        sqlite
          .prepare(
            `update player_import_devices
             set last_used_at = ?, last_error = ?,
                 rate_window_request_count = case
                   when ? - rate_window_started_at >= ? then 1
                   else rate_window_request_count + 1 end,
                 rate_window_started_at = case
                   when ? - rate_window_started_at >= ? then ?
                   else rate_window_started_at end
             where id = ?`,
          )
          .run(
            now,
            message,
            now,
            DEVICE_RATE_WINDOW_MS,
            now,
            DEVICE_RATE_WINDOW_MS,
            now,
            matching.id,
          );
        recordDeviceEvent(
          sqlite,
          matching.id,
          "failed",
          request.requestId,
          now,
          message,
        );
      })();
    if (error instanceof PairingImportError) throw error;
    throw new PairingImportError(message, 400);
  }
}

export function listPlayerImportDevices(
  sqlite: Database.Database,
  userId: string,
): PlayerImportDevice[] {
  return (
    sqlite
      .prepare(
        `select id, name, status, created_at as createdAt,
                last_used_at as lastUsedAt, last_success_at as lastSuccessAt,
                last_error as lastError, revoked_at as revokedAt
         from player_import_devices where user_id = ?
         order by case status when 'active' then 0 else 1 end,
                  created_at desc limit 100`,
      )
      .all(userId) as DeviceListRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    ...(row.lastUsedAt === null ? {} : { lastUsedAt: row.lastUsedAt }),
    ...(row.lastSuccessAt === null ? {} : { lastSuccessAt: row.lastSuccessAt }),
    ...(row.lastError ? { lastError: row.lastError } : {}),
    ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt }),
  }));
}

export function revokePlayerImportDevice(
  sqlite: Database.Database,
  userId: string,
  deviceId: string,
  now = Date.now(),
): boolean {
  return sqlite.transaction(() => {
    const changed = sqlite
      .prepare(
        `update player_import_devices set status = 'revoked', revoked_at = ?,
           token_hash = lower(hex(randomblob(32))), previous_token_hash = null,
           previous_valid_until = null, last_response_json = null
         where id = ? and user_id = ? and status = 'active'`,
      )
      .run(now, deviceId, userId).changes;
    if (changed) recordDeviceEvent(sqlite, deviceId, "revoked", undefined, now);
    return changed === 1;
  })();
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

interface DeviceAuthRow {
  id: string;
  userId: string;
  tokenHash: string;
  previousTokenHash: string | null;
  previousValidUntil: number | null;
  status: "active" | "revoked";
  rateWindowStartedAt: number;
  rateWindowRequestCount: number;
  lastRequestId: string | null;
  lastRequestNextTokenHash: string | null;
  lastResponseJson: string | null;
}

interface DeviceListRow {
  id: string;
  name: string;
  status: "active" | "revoked";
  createdAt: number;
  lastUsedAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  revokedAt: number | null;
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

function validateToken(token: string, label: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new PairingImportError(`${label} is invalid`, 401);
}

function normalizeDeviceName(value: string | undefined): string {
  const name = value?.trim() ?? "";
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
    throw new PairingImportError("Device name is invalid", 400);
  return name;
}

function recordDeviceEvent(
  sqlite: Database.Database,
  deviceId: string,
  outcome: "succeeded" | "failed" | "replayed" | "revoked",
  requestId: string | undefined,
  now: number,
  error?: string,
) {
  sqlite
    .prepare(
      `insert into player_import_device_events
        (id, device_id, occurred_at, outcome, request_id, error)
       values (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      deviceId,
      now,
      outcome,
      requestId ?? null,
      error ?? null,
    );
  sqlite
    .prepare(
      `delete from player_import_device_events where id in (
         select id from player_import_device_events where device_id = ?
         order by occurred_at desc, rowid desc limit -1 offset ?
       )`,
    )
    .run(deviceId, DEVICE_EVENT_LIMIT);
}

function compactImportResult(
  result: PlayerDataImportResult,
): PlayerDataImportResult {
  return {
    snapshotHash: "",
    ...(result.sourceTimestamp
      ? { sourceTimestamp: result.sourceTimestamp }
      : {}),
    parsedRecords: result.parsedRecords,
    inventory: {
      resolvedItems: result.inventory.resolvedItems,
      changedItems: result.inventory.changedItems,
      decreasedItems: result.inventory.decreasedItems,
      unresolvedCount: result.inventory.unresolvedCount,
      unresolvedItemTypes: result.inventory.unresolvedItemTypes.slice(0, 10),
      changes: [],
    },
    progression: result.progression,
    loadout: {
      equipment: [],
      unresolvedCount: result.loadout.unresolvedCount,
      unresolved: result.loadout.unresolved.slice(0, 10),
    },
    warnings: result.warnings
      .slice(0, 10)
      .map((warning) => warning.slice(0, 500)),
    applied: true,
  };
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
