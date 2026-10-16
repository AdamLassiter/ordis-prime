import {
  attachSourceRefreshSnapshot,
  beginSourceRefresh,
  completeSourceRefresh,
  failSourceRefresh,
  getIdentityOverrideRevision,
  promoteSource,
  type PromotionResult,
} from "@ordis-prime/db";
import { collect, type SourceAdapter } from "./adapter.ts";
import type { Snapshot } from "./adapter.ts";
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

export async function refreshSource(
  options: RefreshSourceOptions,
): Promise<RefreshSourceResult> {
  const refreshId = beginSourceRefresh(
    options.database,
    options.adapter.source,
  );
  let snapshotPath: string | undefined;
  try {
    const fetchedSnapshot = await options.adapter.fetch({
      signal: options.signal,
      previousVersion: options.previousVersion,
    });
    snapshotPath = await options.snapshotStore.put(fetchedSnapshot);
    attachSourceRefreshSnapshot(options.database, refreshId, snapshotPath);
    const snapshot = versionSnapshotForIdentityOverrides(
      options.database,
      options.adapter.source.id,
      fetchedSnapshot,
    );
    const observations = await collect(options.adapter, snapshot);
    const promotion = promoteSource(options.database, {
      source: options.adapter.source,
      version: snapshot.version,
      contentHash: snapshot.contentHash,
      retrievedAt: snapshot.retrievedAt,
      snapshotPath,
      minimumRetainedObservationRatio:
        options.adapter.minimumRetainedObservationRatio,
      observations,
    });
    completeSourceRefresh(options.database, refreshId, {
      sourceRunId: promotion.sourceRunId,
      snapshotPath,
      recordsProcessed: observations.length,
    });
    return {
      ...promotion,
      snapshotPath,
      observationCount: observations.length,
    };
  } catch (error) {
    failSourceRefresh(options.database, refreshId, error, snapshotPath);
    throw error;
  }
}

export function versionSnapshotForIdentityOverrides(
  database: PromotionDatabase,
  sourceId: string,
  snapshot: Snapshot,
): Snapshot {
  const overrideRevision = getIdentityOverrideRevision(database, sourceId);
  return overrideRevision
    ? {
        ...snapshot,
        version: `${snapshot.version}|identity-overrides:${overrideRevision}`,
      }
    : snapshot;
}
