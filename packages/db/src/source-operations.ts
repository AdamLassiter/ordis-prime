import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { PromotionSource } from "./promotion.ts";

export interface SourceRefreshRecord {
  id: string;
  status: "running" | "succeeded" | "failed";
  startedAt: number;
  finishedAt?: number;
  sourceRunId?: string;
  worldStateSnapshotId?: string;
  version?: string;
  snapshotPath?: string;
  error?: string;
}

export interface SourceConflictRecord {
  id: string;
  sourceRunId: string;
  version: string;
  snapshotPath?: string;
  recordKey: string;
  reason: string;
  candidateIds: string[];
  resolvedAt?: number;
}

export function beginSourceRefresh(sqlite: Database.Database, source: PromotionSource): string {
  const id = randomUUID();
  sqlite.transaction(() => {
    sqlite.prepare(`
      insert into sources (id, name, homepage, license, priority, enabled)
      values (?, ?, ?, ?, ?, 1)
      on conflict(id) do update set name = excluded.name, homepage = excluded.homepage,
        license = excluded.license, priority = excluded.priority, enabled = 1
    `).run(source.id, source.name, source.homepage, source.license ?? null, source.priority);
    sqlite.prepare("insert into source_refreshes (id, source_id, status, started_at) values (?, ?, 'running', ?)")
      .run(id, source.id, Date.now());
  })();
  return id;
}

export function completeSourceRefresh(sqlite: Database.Database, refreshId: string, input: { sourceRunId?: string; worldStateSnapshotId?: string; snapshotPath: string }): void {
  if (Boolean(input.sourceRunId) === Boolean(input.worldStateSnapshotId)) throw new Error("A completed refresh must link exactly one promoted snapshot");
  const result = sqlite.prepare(`
    update source_refreshes set status = 'succeeded', source_run_id = ?, world_state_snapshot_id = ?, snapshot_path = ?, finished_at = ?, error = null
    where id = ? and status = 'running'
  `).run(input.sourceRunId ?? null, input.worldStateSnapshotId ?? null, input.snapshotPath, Date.now(), refreshId);
  if (result.changes !== 1) throw new Error(`Refresh ${refreshId} is not running`);
}

export function failSourceRefresh(sqlite: Database.Database, refreshId: string, error: unknown, snapshotPath?: string): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const result = sqlite.prepare(`
    update source_refreshes set status = 'failed', snapshot_path = ?, finished_at = ?, error = ?
    where id = ? and status = 'running'
  `).run(snapshotPath ?? null, Date.now(), message.slice(0, 4_000), refreshId);
  if (result.changes !== 1) throw new Error(`Refresh ${refreshId} is not running`);
}

export function listSourceRefreshes(sqlite: Database.Database, sourceId: string, limit = 20): SourceRefreshRecord[] {
  const normalizedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = sqlite.prepare(`
    select refresh.id, refresh.status, refresh.started_at as startedAt, refresh.finished_at as finishedAt,
           refresh.source_run_id as sourceRunId, refresh.world_state_snapshot_id as worldStateSnapshotId,
           coalesce(run.version, world.version) as version, refresh.snapshot_path as snapshotPath, refresh.error
    from source_refreshes refresh
    left join source_runs run on run.id = refresh.source_run_id
    left join world_state_snapshots world on world.id = refresh.world_state_snapshot_id
    where refresh.source_id = ?
    order by refresh.started_at desc, refresh.rowid desc limit ?
  `).all(sourceId, normalizedLimit) as Array<Omit<SourceRefreshRecord, "finishedAt" | "sourceRunId" | "worldStateSnapshotId" | "version" | "snapshotPath" | "error"> & { finishedAt: number | null; sourceRunId: string | null; worldStateSnapshotId: string | null; version: string | null; snapshotPath: string | null; error: string | null }>;
  return rows.map((row) => ({
    id: row.id, status: row.status, startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? undefined, sourceRunId: row.sourceRunId ?? undefined, worldStateSnapshotId: row.worldStateSnapshotId ?? undefined,
    version: row.version ?? undefined, snapshotPath: row.snapshotPath ?? undefined, error: row.error ?? undefined,
  }));
}

export function listSourceConflicts(sqlite: Database.Database, sourceId: string, limit = 100): SourceConflictRecord[] {
  const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const rows = sqlite.prepare(`
    select conflict.id, conflict.source_run_id as sourceRunId, run.version, run.snapshot_path as snapshotPath,
           conflict.record_key as recordKey, conflict.reason, conflict.candidates_json as candidatesJson,
           conflict.resolved_at as resolvedAt
    from ingestion_conflicts conflict
    join source_runs run on run.id = conflict.source_run_id
    where run.source_id = ?
    order by case when conflict.resolved_at is null then 0 else 1 end, run.retrieved_at desc, conflict.rowid desc
    limit ?
  `).all(sourceId, normalizedLimit) as Array<Omit<SourceConflictRecord, "candidateIds" | "snapshotPath" | "resolvedAt"> & { candidatesJson: string; snapshotPath: string | null; resolvedAt: number | null }>;
  return rows.map(({ candidatesJson, snapshotPath, resolvedAt, ...row }) => ({
    ...row,
    candidateIds: parseCandidateIds(candidatesJson),
    snapshotPath: snapshotPath ?? undefined,
    resolvedAt: resolvedAt ?? undefined,
  }));
}

function parseCandidateIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
