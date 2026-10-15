import { createHash } from "node:crypto";
import type { Observation } from "@ordis-prime/domain";

export interface SourceDescriptor {
  id: string;
  name: string;
  homepage: string;
  license?: string;
  priority: number;
}
export interface Snapshot {
  sourceId: string;
  version: string;
  retrievedAt: string;
  contentHash: string;
  mediaType: string;
  bytes: Uint8Array;
}
export interface FetchContext {
  signal?: AbortSignal;
  previousVersion?: string;
}
export interface SourceAdapter {
  readonly source: SourceDescriptor;
  fetch(context: FetchContext): Promise<Snapshot>;
  parse(snapshot: Snapshot): AsyncIterable<Observation>;
}

export function contentHash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function createSnapshot(input: Omit<Snapshot, "contentHash">): Snapshot {
  return { ...input, contentHash: contentHash(input.bytes) };
}

export async function collect(
  adapter: SourceAdapter,
  snapshot: Snapshot,
): Promise<Observation[]> {
  if (snapshot.sourceId !== adapter.source.id)
    throw new Error(
      `Snapshot source ${snapshot.sourceId} does not match adapter ${adapter.source.id}`,
    );
  const observations: Observation[] = [];
  for await (const observation of adapter.parse(snapshot)) {
    if (observation.evidence.sourceId !== adapter.source.id)
      throw new Error(
        `Observation has incorrect source ${observation.evidence.sourceId}`,
      );
    observations.push(observation);
  }
  if (!observations.length)
    throw new Error(`${adapter.source.id} produced no observations`);
  return observations;
}
