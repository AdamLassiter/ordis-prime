import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Observation } from "@ordis-prime/domain";
import {
  createLocalUser,
  getDiscoveryProgress,
  migrateDatabase,
  openSqliteDatabase,
  promoteSource,
  searchDiscoveryCatalog,
  setDiscoveryProgress,
} from "../src/index.ts";

test("discovery progress is private, filterable, and reset by unseen", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-discovery-progress-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const evidence = {
    sourceId: "fixture",
    sourceRecordKey: "quest",
    snapshotVersion: "v1",
    retrievedAt: "2026-10-13T12:00:00.000Z",
  };
  const observations: Observation[] = [
    {
      type: "entity",
      kind: "quest",
      externalIds: [{ sourceId: "fixture", namespace: "id", value: "quest" }],
      fields: { name: "Hidden Quest", slug: "hidden-quest" },
      evidence,
    },
    {
      type: "entity",
      kind: "mechanic",
      externalIds: [{ sourceId: "fixture", namespace: "id", value: "system" }],
      fields: { name: "Deep System", slug: "deep-system" },
      evidence: { ...evidence, sourceRecordKey: "system" },
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

  assert.equal(
    getDiscoveryProgress(sqlite, firstUser, {
      kind: "quest",
      slug: "hidden-quest",
    }),
    "unseen",
  );
  setDiscoveryProgress(
    sqlite,
    firstUser,
    { kind: "quest", slug: "hidden-quest" },
    "completed",
  );
  assert.equal(
    getDiscoveryProgress(sqlite, firstUser, {
      kind: "quest",
      slug: "hidden-quest",
    }),
    "completed",
  );
  assert.equal(
    getDiscoveryProgress(sqlite, secondUser, {
      kind: "quest",
      slug: "hidden-quest",
    }),
    "unseen",
  );
  assert.deepEqual(
    searchDiscoveryCatalog(sqlite, {
      userId: firstUser,
      progress: "completed",
    }).map(({ name }) => name),
    ["Hidden Quest"],
  );
  assert.deepEqual(
    searchDiscoveryCatalog(sqlite, {
      userId: firstUser,
      progress: "unseen",
    }).map(({ name }) => name),
    ["Deep System"],
  );
  setDiscoveryProgress(
    sqlite,
    firstUser,
    { kind: "quest", slug: "hidden-quest" },
    "unseen",
  );
  assert.equal(
    (
      sqlite
        .prepare("select count(*) as count from player_discovery_progress")
        .get() as { count: number }
    ).count,
    0,
  );
  assert.throws(
    () =>
      setDiscoveryProgress(
        sqlite,
        firstUser,
        { kind: "weapon", slug: "missing" },
        "completed",
      ),
    /Unknown active discovery/,
  );
});
