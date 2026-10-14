import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const WORLD_STATE_REFRESH_JOB = "refresh-world-state";
export const CATALOG_SOURCE_REFRESH_JOB = "refresh-catalog-source";

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  runAfter: number;
}

export function ensurePendingJob(sqlite: Database.Database, input: { kind: string; payload: Record<string, unknown>; runAfter: number }): string {
  const payloadJson = JSON.stringify(input.payload);
  return sqlite.transaction(() => {
    const existing = sqlite.prepare("select id from jobs where kind = ? and payload_json = ? and status in ('queued', 'running') limit 1")
      .get(input.kind, payloadJson) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = randomUUID();
    sqlite.prepare("insert into jobs (id, kind, status, payload_json, run_after) values (?, ?, 'queued', ?, ?)")
      .run(id, input.kind, payloadJson, input.runAfter);
    return id;
  }).immediate();
}

export function enqueueJobNow(sqlite: Database.Database, input: { kind: string; payload: Record<string, unknown>; now?: number }): string {
  const payloadJson = JSON.stringify(input.payload);
  const now = input.now ?? Date.now();
  if (!input.kind || !Number.isFinite(now)) throw new Error("Invalid job request");
  return sqlite.transaction(() => {
    const existing = sqlite.prepare("select id, status, run_after as runAfter from jobs where kind = ? and payload_json = ? and status in ('queued', 'running') order by run_after limit 1")
      .get(input.kind, payloadJson) as { id: string; status: "queued" | "running"; runAfter: number } | undefined;
    if (existing) {
      if (existing.status === "queued" && existing.runAfter > now) sqlite.prepare("update jobs set run_after = ? where id = ?").run(now, existing.id);
      return existing.id;
    }
    const id = randomUUID();
    sqlite.prepare("insert into jobs (id, kind, status, payload_json, run_after) values (?, ?, 'queued', ?, ?)").run(id, input.kind, payloadJson, now);
    return id;
  }).immediate();
}

export function claimDueJob(sqlite: Database.Database, input: { owner: string; now: number; leaseMilliseconds: number; kinds: string[] }): ClaimedJob | undefined {
  if (!input.owner || !Number.isFinite(input.now) || input.leaseMilliseconds <= 0 || !input.kinds.length) throw new Error("Invalid job claim");
  return sqlite.transaction(() => {
    sqlite.prepare(`
      update jobs set status = 'queued', lease_owner = null, lease_until = null,
        error = coalesce(error, 'Previous worker lease expired')
      where status = 'running' and lease_until <= ?
    `).run(input.now);
    const placeholders = input.kinds.map(() => "?").join(", ");
    const row = sqlite.prepare(`
      select id, kind, payload_json as payloadJson, run_after as runAfter
      from jobs
      where status = 'queued' and run_after <= ? and kind in (${placeholders})
      order by run_after, case kind when 'refresh-world-state' then 0 else 1 end, id limit 1
    `).get(input.now, ...input.kinds) as { id: string; kind: string; payloadJson: string; runAfter: number } | undefined;
    if (!row) return undefined;
    sqlite.prepare("update jobs set status = 'running', lease_owner = ?, lease_until = ?, error = null where id = ?")
      .run(input.owner, input.now + input.leaseMilliseconds, row.id);
    return { id: row.id, kind: row.kind, payload: parsePayload(row.payloadJson), runAfter: row.runAfter };
  }).immediate();
}

export function finishAndRescheduleJob(sqlite: Database.Database, input: { id: string; owner: string; succeeded: boolean; error?: string; kind: string; payload: Record<string, unknown>; nextRunAfter: number }): string {
  const nextId = randomUUID();
  return sqlite.transaction(() => {
    const result = sqlite.prepare(`
      update jobs set status = ?, lease_owner = null, lease_until = null, error = ?
      where id = ? and status = 'running' and lease_owner = ?
    `).run(input.succeeded ? "succeeded" : "failed", input.error?.slice(0, 2_000) ?? null, input.id, input.owner);
    if (result.changes !== 1) throw new Error(`Job ${input.id} is not leased by ${input.owner}`);
    sqlite.prepare("insert into jobs (id, kind, status, payload_json, run_after) values (?, ?, 'queued', ?, ?)")
      .run(nextId, input.kind, JSON.stringify(input.payload), input.nextRunAfter);
    return nextId;
  }).immediate();
}

export function pruneFinishedJobs(sqlite: Database.Database, retain = 1_000): number {
  if (!Number.isSafeInteger(retain) || retain < 0 || retain > 100_000) throw new Error("Job history retention must be between 0 and 100000");
  const result = sqlite.prepare(`
    delete from jobs where rowid in (
      select rowid from jobs where status in ('succeeded', 'failed')
      order by rowid desc limit -1 offset ?
    )
  `).run(retain);
  return result.changes;
}

function parsePayload(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Job payload must be an object");
  return parsed as Record<string, unknown>;
}
