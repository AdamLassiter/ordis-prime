import { beginSourceRefresh, completeSourceRefresh, failSourceRefresh, promoteSource, type PromotionResult } from "@ordis-prime/db";
import { collect, type SourceAdapter } from "./adapter.ts";
import { SnapshotStore } from "./snapshot-store.ts";

type PromotionDatabase = Parameters<typeof promoteSource>[0];

export interface RefreshSourceOptions {
  adapter: SourceAdapter;
  database: PromotionDatabase;
  snapshotStore: SnapshotStore;
  signal?: AbortSignal;
  previousVersion?: string;
}

export interface RefreshSourceResult extends PromotionResult {
  snapshotPath: string;
  observationCount: number;
}

export async function refreshSource(options: RefreshSourceOptions): Promise<RefreshSourceResult> {
  const refreshId = beginSourceRefresh(options.database, options.adapter.source);
  let snapshotPath: string | undefined;
  try {
    const snapshot = await options.adapter.fetch({
      signal: options.signal,
      previousVersion: options.previousVersion,
    });
    snapshotPath = await options.snapshotStore.put(snapshot);
    const observations = await collect(options.adapter, snapshot);
    const promotion = promoteSource(options.database, {
      source: options.adapter.source,
      version: snapshot.version,
      contentHash: snapshot.contentHash,
      retrievedAt: snapshot.retrievedAt,
      snapshotPath,
      observations,
    });
    completeSourceRefresh(options.database, refreshId, { sourceRunId: promotion.sourceRunId, snapshotPath, recordsProcessed: observations.length });
    return { ...promotion, snapshotPath, observationCount: observations.length };
  } catch (error) {
    failSourceRefresh(options.database, refreshId, error, snapshotPath);
    throw error;
  }
}
