import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Observation } from "@ordis-prime/domain";
import {
  createLocalUser,
  getNodeCompletion,
  migrateDatabase,
  openSqliteDatabase,
  promoteSource,
  setNodeCompletion,
  setNodeCompletions,
} from "../src/index.ts";

test("node completion is private and absence means incomplete", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-node-progress-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const evidence = {
    sourceId: "fixture",
    sourceRecordKey: "e-prime",
    snapshotVersion: "v1",
    retrievedAt: "2026-10-19T12:00:00.000Z",
  };
  const observations: Observation[] = [
    {
      type: "entity",
      kind: "node",
      externalIds: [{ sourceId: "fixture", namespace: "id", value: "e-prime" }],
      fields: { name: "E Prime", slug: "e-prime" },
      evidence,
    },
  ];
  promoteSource(sqlite, {
    source: {
      id: "fixture",
      name: "Fixture",
      homepage: "https://example.test",
      priority: 1,
    },
    version: "v1",
    contentHash: "sha256:fixture",
    retrievedAt: evidence.retrievedAt,
    observations,
  });
  const firstUser = createLocalUser(sqlite, { username: "First" });
  const secondUser = createLocalUser(sqlite, { username: "Second" });

  assert.equal(getNodeCompletion(sqlite, firstUser, "e-prime"), "incomplete");
  setNodeCompletion(sqlite, firstUser, "e-prime", true);
  assert.equal(getNodeCompletion(sqlite, firstUser, "e-prime"), "completed");
  assert.equal(getNodeCompletion(sqlite, secondUser, "e-prime"), "incomplete");

  sqlite
    .prepare(
      "update player_node_progress set completed_at = 123, updated_at = 123 where user_id = ?",
    )
    .run(firstUser);
  setNodeCompletion(sqlite, firstUser, "e-prime", true);
  const timestamps = sqlite
    .prepare(
      "select completed_at as completedAt, updated_at as updatedAt from player_node_progress where user_id = ?",
    )
    .get(firstUser) as { completedAt: number; updatedAt: number };
  assert.equal(timestamps.completedAt, 123);
  assert.ok(timestamps.updatedAt > timestamps.completedAt);

  setNodeCompletion(sqlite, firstUser, "e-prime", false);
  assert.equal(getNodeCompletion(sqlite, firstUser, "e-prime"), "incomplete");
  assert.throws(
    () => setNodeCompletion(sqlite, firstUser, "missing", true),
    /Unknown active node/,
  );
});

test("bulk node completion is atomic and preserves existing completion time", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-node-progress-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const evidence = {
    sourceId: "fixture",
    sourceRecordKey: "nodes",
    snapshotVersion: "v1",
    retrievedAt: "2026-10-19T12:00:00.000Z",
  };
  promoteSource(sqlite, {
    source: {
      id: "fixture",
      name: "Fixture",
      homepage: "https://example.test",
      priority: 1,
    },
    version: "v1",
    contentHash: "sha256:fixture",
    retrievedAt: evidence.retrievedAt,
    observations: ["e-prime", "mantle"].map((slug) => ({
      type: "entity" as const,
      kind: "node" as const,
      externalIds: [{ sourceId: "fixture", namespace: "id", value: slug }],
      fields: { name: slug, slug },
      evidence: { ...evidence, sourceRecordKey: slug },
    })),
  });
  const userId = createLocalUser(sqlite, { username: "Bulk" });

  setNodeCompletion(sqlite, userId, "e-prime", true);
  sqlite
    .prepare(
      "update player_node_progress set completed_at = 123, updated_at = 123 where user_id = ?",
    )
    .run(userId);
  setNodeCompletions(sqlite, userId, [
    { slug: "e-prime", completed: true },
    { slug: "mantle", completed: true },
  ]);
  assert.equal(getNodeCompletion(sqlite, userId, "e-prime"), "completed");
  assert.equal(getNodeCompletion(sqlite, userId, "mantle"), "completed");
  assert.equal(
    (
      sqlite
        .prepare(
          `select progress.completed_at as completedAt
           from player_node_progress progress
           join entities node on node.id = progress.node_id
           where progress.user_id = ? and node.slug = 'e-prime'`,
        )
        .get(userId) as { completedAt: number }
    ).completedAt,
    123,
  );

  assert.throws(
    () =>
      setNodeCompletions(sqlite, userId, [
        { slug: "e-prime", completed: false },
        { slug: "missing", completed: true },
      ]),
    /Unknown active node missing/,
  );
  assert.equal(getNodeCompletion(sqlite, userId, "e-prime"), "completed");
  assert.throws(
    () =>
      setNodeCompletions(sqlite, userId, [
        { slug: "mantle", completed: false },
        { slug: "mantle", completed: true },
      ]),
    /Duplicate node completion mantle/,
  );
});
