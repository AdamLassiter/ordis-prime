import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { Observation } from "@ordis-prime/domain";
import { migrateDatabase, promoteSource } from "../src/index.ts";

const source = { id: "fixture", name: "Fixture", homepage: "https://example.test", license: "CC0", priority: 10 };

test("promotion atomically replaces the active source run while preserving entity IDs", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-promotion-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const first = promoteSource(sqlite, input("v1", [entity("reward", "Ash Chassis", "component"), entity("node", "Falling Glory", "node"), drop("v1", 0.1)]));
  const stableId = (sqlite.prepare("select id from entities where name = 'Ash Chassis'").get() as { id: string }).id;
  const second = promoteSource(sqlite, input("v2", [entity("reward", "Ash Prime Chassis", "component", "v2"), entity("node", "Falling Glory", "node", "v2"), drop("v2", 0.2)]));

  assert.equal(first.entitiesCreated, 2);
  assert.equal(second.entitiesMatched, 2);
  assert.equal((sqlite.prepare("select id from entities where name = 'Ash Prime Chassis'").get() as { id: string }).id, stableId);
  assert.deepEqual(sqlite.prepare("select version, status from source_runs order by version").all(), [
    { version: "v1", status: "staged" },
    { version: "v2", status: "active" },
  ]);
  assert.equal((sqlite.prepare("select count(*) as count from catalog_releases where active = 1").get() as { count: number }).count, 1);
  assert.equal((sqlite.prepare("select count(*) as count from drops d join source_runs r on r.id = d.source_run_id where r.status = 'active'").get() as { count: number }).count, 1);

  assert.throws(() => promoteSource(sqlite, input("v3", [entity("reward", "Broken", "component", "v3"), { ...drop("v3", 2), chance: 2 }])), /outside/);
  assert.equal((sqlite.prepare("select count(*) as count from source_runs").get() as { count: number }).count, 2);
  assert.equal((sqlite.prepare("select name from entities where id = ?").get(stableId) as { name: string }).name, "Ash Prime Chassis");

  const colliding = [
    { ...entity("collision-a", "Collision A", "component", "v4"), fields: { name: "Collision A", slug: "same-slug" } },
    { ...entity("collision-b", "Collision B", "component", "v4"), fields: { name: "Collision B", slug: "same-slug" } },
  ] satisfies Observation[];
  assert.throws(() => promoteSource(sqlite, input("v4", colliding)), /UNIQUE constraint failed/);
  assert.equal((sqlite.prepare("select count(*) as count from source_runs").get() as { count: number }).count, 2);
  assert.equal((sqlite.prepare("select count(*) as count from entities where slug = 'same-slug'").get() as { count: number }).count, 0);
  assert.equal((sqlite.prepare("select version from source_runs where status = 'active'").get() as { version: string }).version, "v2");
});

test("ambiguous aliases are recorded for review without corrupting relationships", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-promotion-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(sqlite, input("v1", [
    entity("one", "First", "component"),
    entity("two", "Second", "component"),
  ]));
  const seeded = sqlite.prepare("select id from entities order by name").all() as Array<{ id: string }>;
  const insertAlias = sqlite.prepare("insert into entity_aliases (entity_id, normalized, display) values (?, 'shared', 'Shared')");
  for (const row of seeded) insertAlias.run(row.id);
  const ambiguous = {
    ...entity("three", "Shared", "component", "v2"),
    externalIds: [{ sourceId: "other", namespace: "id", value: "three" }],
    evidence: evidence("v2", "other"),
  } satisfies Observation;
  const result = promoteSource(sqlite, {
    ...input("v2", [ambiguous]),
    source: { ...source, id: "other" },
  });

  assert.equal(result.conflictsCreated, 1);
  assert.equal(result.entitiesCreated, 0);
  assert.match((sqlite.prepare("select reason from ingestion_conflicts where source_run_id = ?").get(result.sourceRunId) as { reason: string }).reason, /ambiguous/);
});

function input(version: string, observations: Observation[]) {
  return { source, version, contentHash: `sha256:${version.padEnd(64, "0")}`, retrievedAt: "2026-10-13T12:00:00.000Z", observations };
}

function evidence(version = "v1", sourceId = "fixture") {
  return { sourceId, sourceRecordKey: "record", snapshotVersion: version, retrievedAt: "2026-10-13T12:00:00.000Z" };
}

function entity(id: string, name: string, kind: "component" | "node", version = "v1"): Observation {
  return { type: "entity", kind, externalIds: [{ sourceId: "fixture", namespace: "id", value: id }], fields: { name, slug: name.toLowerCase().replaceAll(" ", "-") }, evidence: evidence(version) };
}

function drop(version: string, chance: number): Observation {
  return { type: "drop", rewardExternalId: { sourceId: "fixture", namespace: "id", value: "reward" }, nodeExternalId: { sourceId: "fixture", namespace: "id", value: "node" }, locationLabel: "Falling Glory, Venus", chance, evidence: evidence(version) };
}
