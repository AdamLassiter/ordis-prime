import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { contentHash, type Snapshot } from "./adapter.ts";

interface StoredSnapshotMetadata {
  sourceId: string;
  version: string;
  retrievedAt: string;
  contentHash: string;
  mediaType: string;
}

const safeSegment = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const sha256Hash = /^sha256:([a-f0-9]{64})$/;
const digestDirectory = /^[a-f0-9]{64}$/;

export class SnapshotStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  auxiliaryCacheDirectory(name: string): string {
    if (!safeSegment.test(name)) throw new Error(`Unsafe cache name: ${name}`);
    return path.join(path.dirname(this.root), "cache", name);
  }

  async put(snapshot: Snapshot): Promise<string> {
    validateSnapshot(snapshot);
    const digest = snapshot.contentHash.slice("sha256:".length);
    const sourceDirectory = path.join(this.root, snapshot.sourceId);
    const destination = path.join(sourceDirectory, digest);
    const temporary = path.join(
      sourceDirectory,
      `.tmp-${digest}-${randomUUID()}`,
    );

    await fs.mkdir(sourceDirectory, { recursive: true });
    try {
      await fs.mkdir(temporary);
      await fs.writeFile(path.join(temporary, "payload"), snapshot.bytes, {
        flag: "wx",
      });
      const metadata: StoredSnapshotMetadata = {
        sourceId: snapshot.sourceId,
        version: snapshot.version,
        retrievedAt: snapshot.retrievedAt,
        contentHash: snapshot.contentHash,
        mediaType: snapshot.mediaType,
      };
      await fs.writeFile(
        path.join(temporary, "metadata.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
        { flag: "wx" },
      );
      try {
        await fs.rename(temporary, destination);
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        await fs.rm(temporary, { recursive: true, force: true });
        const now = new Date();
        await fs.utimes(destination, now, now);
        await this.load(snapshot.sourceId, snapshot.contentHash);
      }
    } catch (error) {
      await fs.rm(temporary, { recursive: true, force: true });
      throw error;
    }
    return destination;
  }

  async load(sourceId: string, hash: string): Promise<Snapshot> {
    validatePathParts(sourceId, hash);
    const digest = hash.slice("sha256:".length);
    const directory = path.join(this.root, sourceId, digest);
    const [metadataBytes, bytes] = await Promise.all([
      fs.readFile(path.join(directory, "metadata.json")),
      fs.readFile(path.join(directory, "payload")),
    ]);
    const metadata = JSON.parse(
      metadataBytes.toString("utf8"),
    ) as StoredSnapshotMetadata;
    const snapshot = { ...metadata, bytes: new Uint8Array(bytes) };
    validateSnapshot(snapshot);
    if (metadata.sourceId !== sourceId || metadata.contentHash !== hash) {
      throw new Error("Stored snapshot metadata does not match its path");
    }
    return snapshot;
  }

  async pruneUnreferenced(
    retainedPaths: Iterable<string>,
    options: { minimumAgeMilliseconds?: number; now?: number } = {},
  ): Promise<number> {
    const minimumAgeMilliseconds =
      options.minimumAgeMilliseconds ?? 60 * 60_000;
    const now = options.now ?? Date.now();
    if (
      !Number.isSafeInteger(minimumAgeMilliseconds) ||
      minimumAgeMilliseconds < 0
    )
      throw new Error("Snapshot prune grace must be a non-negative integer");
    if (!Number.isFinite(now))
      throw new Error("Snapshot prune time is invalid");
    const retained = new Set(
      [...retainedPaths].filter(Boolean).map((entry) => path.resolve(entry)),
    );
    const sources = await readDirectories(this.root);
    let deleted = 0;
    for (const source of sources) {
      if (!safeSegment.test(source.name)) continue;
      const sourceDirectory = path.join(this.root, source.name);
      for (const entry of await readDirectories(sourceDirectory)) {
        if (!digestDirectory.test(entry.name)) continue;
        const candidate = path.join(sourceDirectory, entry.name);
        if (retained.has(path.resolve(candidate))) continue;
        let stats;
        try {
          stats = await fs.stat(candidate);
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        if (now - stats.mtimeMs < minimumAgeMilliseconds) continue;
        try {
          await fs.rm(candidate, { recursive: true, force: false });
          deleted += 1;
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
    }
    return deleted;
  }
}

async function readDirectories(directory: string) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory(),
    );
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function validatePathParts(sourceId: string, hash: string): void {
  if (!safeSegment.test(sourceId))
    throw new Error(`Unsafe source ID: ${sourceId}`);
  if (!sha256Hash.test(hash)) throw new Error(`Invalid snapshot hash: ${hash}`);
}

function validateSnapshot(snapshot: Snapshot): void {
  validatePathParts(snapshot.sourceId, snapshot.contentHash);
  if (!snapshot.version || !snapshot.retrievedAt || !snapshot.mediaType) {
    throw new Error("Snapshot metadata is incomplete");
  }
  const actual = contentHash(snapshot.bytes);
  if (actual !== snapshot.contentHash) {
    throw new Error(
      `Snapshot hash mismatch: expected ${snapshot.contentHash}, received ${actual}`,
    );
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EEXIST" || error.code === "ENOTEMPTY")
  );
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
