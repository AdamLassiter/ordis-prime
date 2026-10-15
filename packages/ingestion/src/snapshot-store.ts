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

export class SnapshotStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
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
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
