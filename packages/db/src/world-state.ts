import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { WorldStateWindowKind, WorldStateWindowObservation } from "@ordis-prime/domain";
import type { PromotionSource } from "./promotion.ts";

export interface PromoteWorldStateInput {
  source: PromotionSource;
  version: string;
  contentHash: string;
  observedAt: string;
  snapshotPath: string;
  windows: WorldStateWindowObservation[];
}

export interface CurrentWorldStateWindow {
  externalId: string;
  kind: WorldStateWindowKind;
  label: string;
  activation?: number;
  expiry?: number;
  state?: string;
  nodeLabel?: string;
  metadata: Record<string, string | number | boolean | null>;
  sourceId: string;
  sourceName: string;
  snapshotVersion: string;
  observedAt: number;
  sourceRecordKey: string;
  sourcePath?: string;
}

export function promoteWorldState(sqlite: Database.Database, input: PromoteWorldStateInput): { snapshotId: string; windowCount: number } {
  validateWorldState(input);
  return sqlite.transaction(() => {
    sqlite.prepare(`
      insert into sources (id, name, homepage, license, priority, enabled)
      values (?, ?, ?, ?, ?, 1)
      on conflict(id) do update set name = excluded.name, homepage = excluded.homepage,
        license = excluded.license, priority = excluded.priority, enabled = 1
    `).run(input.source.id, input.source.name, input.source.homepage, input.source.license ?? null, input.source.priority);
    const existing = sqlite.prepare("select id, content_hash as contentHash from world_state_snapshots where source_id = ? and version = ?")
      .get(input.source.id, input.version) as { id: string; contentHash: string } | undefined;
    if (existing) {
      if (existing.contentHash !== input.contentHash) throw new Error(`World state ${input.source.id} reused version ${input.version} with different content`);
      sqlite.prepare("update world_state_snapshots set active = case when id = ? then 1 else 0 end where source_id = ?").run(existing.id, input.source.id);
      return { snapshotId: existing.id, windowCount: input.windows.length };
    }
    const snapshotId = randomUUID();
    sqlite.prepare(`
      insert into world_state_snapshots (id, source_id, version, content_hash, observed_at, snapshot_path, active)
      values (?, ?, ?, ?, ?, ?, 0)
    `).run(snapshotId, input.source.id, input.version, input.contentHash, Date.parse(input.observedAt), input.snapshotPath);
    const insert = sqlite.prepare(`
      insert into world_state_windows
        (snapshot_id, external_id, kind, label, activation, expiry, state, node_label, metadata_json, source_record_key, source_path)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const window of input.windows) {
      insert.run(snapshotId, window.externalId, window.kind, window.label,
        window.activation ? Date.parse(window.activation) : null, window.expiry ? Date.parse(window.expiry) : null,
        window.state ?? null, window.nodeLabel ?? null, JSON.stringify(window.metadata ?? {}),
        window.evidence.sourceRecordKey, window.evidence.path ?? null);
    }
    sqlite.prepare("update world_state_snapshots set active = 0 where source_id = ?").run(input.source.id);
    sqlite.prepare("update world_state_snapshots set active = 1 where id = ?").run(snapshotId);
    return { snapshotId, windowCount: input.windows.length };
  })();
}

export function listCurrentWorldState(sqlite: Database.Database, now = Date.now()): CurrentWorldStateWindow[] {
  const rows = sqlite.prepare(`
    select window.external_id as externalId, window.kind, window.label, window.activation, window.expiry,
           window.state, window.node_label as nodeLabel, window.metadata_json as metadataJson,
           source.id as sourceId, source.name as sourceName, snapshot.version as snapshotVersion,
           snapshot.observed_at as observedAt, window.source_record_key as sourceRecordKey,
           window.source_path as sourcePath
    from world_state_windows window
    join world_state_snapshots snapshot on snapshot.id = window.snapshot_id and snapshot.active = 1
    join sources source on source.id = snapshot.source_id
    where window.expiry is null or window.expiry > ?
    order by case window.kind when 'cycle' then 0 when 'event' then 1 when 'alert' then 2 when 'fissure' then 3 else 4 end,
             coalesce(window.expiry, 9223372036854775807), window.label collate nocase
  `).all(now) as Array<Omit<CurrentWorldStateWindow, "activation" | "expiry" | "state" | "nodeLabel" | "metadata" | "sourcePath"> & { activation: number | null; expiry: number | null; state: string | null; nodeLabel: string | null; metadataJson: string; sourcePath: string | null }>;
  return rows.map(({ activation, expiry, state, nodeLabel, metadataJson, sourcePath, ...row }) => ({
    ...row,
    activation: activation ?? undefined,
    expiry: expiry ?? undefined,
    state: state ?? undefined,
    nodeLabel: nodeLabel ?? undefined,
    metadata: parseMetadata(metadataJson),
    sourcePath: sourcePath ?? undefined,
  }));
}

function validateWorldState(input: PromoteWorldStateInput): void {
  if (!input.version || !input.contentHash || !input.snapshotPath || !Number.isFinite(Date.parse(input.observedAt))) throw new Error("World-state snapshot metadata is invalid");
  const ids = new Set<string>();
  for (const window of input.windows) {
    if (!window.externalId || !window.label || ids.has(window.externalId)) throw new Error(`Invalid or duplicate world-state window ID ${window.externalId}`);
    ids.add(window.externalId);
    if (window.evidence.sourceId !== input.source.id || window.evidence.snapshotVersion !== input.version) throw new Error(`World-state evidence does not match snapshot for ${window.externalId}`);
    const activation = window.activation ? Date.parse(window.activation) : undefined;
    const expiry = window.expiry ? Date.parse(window.expiry) : undefined;
    if (activation !== undefined && !Number.isFinite(activation)) throw new Error(`Invalid activation for ${window.externalId}`);
    if (expiry !== undefined && !Number.isFinite(expiry)) throw new Error(`Invalid expiry for ${window.externalId}`);
    if (activation !== undefined && expiry !== undefined && expiry <= activation) throw new Error(`World-state window ${window.externalId} expires before it activates`);
  }
}

function parseMetadata(value: string): Record<string, string | number | boolean | null> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, string | number | boolean | null> : {};
  } catch {
    return {};
  }
}
