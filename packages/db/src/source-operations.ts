import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { PromotionSource } from "./promotion.ts";

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

export function completeSourceRefresh(sqlite: Database.Database, refreshId: string, input: { sourceRunId: string; snapshotPath: string }): void {
  const result = sqlite.prepare(`
    update source_refreshes set status = 'succeeded', source_run_id = ?, snapshot_path = ?, finished_at = ?, error = null
    where id = ? and status = 'running'
  `).run(input.sourceRunId, input.snapshotPath, Date.now(), refreshId);
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
