import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { contentHash, createSnapshot, SnapshotStore } from "../src/index.ts";

test("snapshot store persists and verifies immutable provider bytes", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-snapshots-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const bytes = new TextEncoder().encode('{"items":["Ash"]}');
  const snapshot = createSnapshot({
    sourceId: "wfcd-items",
    version: "fixture-1",
    retrievedAt: "2026-10-13T12:00:00.000Z",
    mediaType: "application/json",
    bytes,
  });
  const store = new SnapshotStore(root);

  const firstPath = await store.put(snapshot);
  const secondPath = await store.put(snapshot);
  const loaded = await store.load(snapshot.sourceId, snapshot.contentHash);

  assert.equal(firstPath, secondPath);
  assert.equal(loaded.contentHash, contentHash(bytes));
  assert.deepEqual(loaded.bytes, bytes);
});

test("snapshot store rejects corrupted and unsafe snapshots", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-snapshots-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new SnapshotStore(root);
  const valid = createSnapshot({
    sourceId: "wfcd-items",
    version: "fixture-1",
    retrievedAt: "2026-10-13T12:00:00.000Z",
    mediaType: "application/json",
    bytes: new Uint8Array([1, 2, 3]),
  });

  await assert.rejects(() => store.put({ ...valid, bytes: new Uint8Array([4]) }), /hash mismatch/);
  await assert.rejects(() => store.put({ ...valid, sourceId: "../escape" }), /Unsafe source ID/);
});
