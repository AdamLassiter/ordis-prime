import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { Observation } from "@ordis-prime/domain";
import { migrateDatabase, previewSourcePromotion, promoteSource } from "../src/index.ts";

const source = { id: "fixture", name: "Fixture", homepage: "https://example.test", license: "CC0", priority: 10 };

test("source previews execute promotion validation and roll back every write", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-preview-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const preview = previewSourcePromotion(sqlite, input("v1", [entity("reward", "Ash Chassis", "component")]));
  assert.equal(preview.entitiesCreated, 1);
  assert.deepEqual(sqlite.prepare("select (select count(*) from sources) as sources, (select count(*) from source_runs) as runs, (select count(*) from entities) as entities, (select count(*) from catalog_releases) as releases").get(), { sources: 0, runs: 0, entities: 0, releases: 0 });
  assert.equal(promoteSource(sqlite, input("v1", [entity("reward", "Ash Chassis", "component")])).entitiesCreated, 1);
});

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
  assert.deepEqual(sqlite.prepare("select source_record_key as recordKey from drops d join source_runs r on r.id = d.source_run_id where r.status = 'active'").get(), { recordKey: "record" });
  assert.equal(promoteSource(sqlite, input("v2", [entity("reward", "Ash Prime Chassis", "component", "v2"), entity("node", "Falling Glory", "node", "v2"), drop("v2", 0.2)])).entitiesCreated, 0);

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

test("each catalog release records its complete active source-run composition", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-releases-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const firstA = promoteSource(sqlite, input("a-v1", [entity("a", "Source A", "component", "a-v1")]));
  const sourceB = { ...source, id: "fixture-b", name: "Fixture B" };
  const firstB = promoteSource(sqlite, { ...input("b-v1", [entity("b", "Source B", "component", "b-v1", "fixture-b")]), source: sourceB });
  const secondA = promoteSource(sqlite, input("a-v2", [entity("a", "Source A revised", "component", "a-v2")]));

  const releaseMembers = sqlite.prepare(`
    select member.source_id as sourceId, run.version
    from catalog_release_sources member join source_runs run on run.id = member.source_run_id
    where member.release_id = ? order by member.source_id
  `);
  assert.deepEqual(releaseMembers.all(firstA.releaseId), [{ sourceId: "fixture", version: "a-v1" }]);
  assert.deepEqual(releaseMembers.all(firstB.releaseId), [{ sourceId: "fixture", version: "a-v1" }, { sourceId: "fixture-b", version: "b-v1" }]);
  assert.deepEqual(releaseMembers.all(secondA.releaseId), [{ sourceId: "fixture", version: "a-v2" }, { sourceId: "fixture-b", version: "b-v1" }]);
  assert.equal(promoteSource(sqlite, input("a-v2", [entity("a", "Source A revised", "component", "a-v2")])).releaseId, secondA.releaseId);
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

test("a typed source refines an untyped drop reward without changing its identity", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-promotion-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(sqlite, input("v1", [entity("reward", "Vitality", "unknown")]));
  const before = sqlite.prepare("select id, kind from entities").get() as { id: string; kind: string };
  const typed = {
    ...entity("mod-vitality", "Vitality", "mod", "v2", "typed"),
    evidence: evidence("v2", "typed"),
  } satisfies Observation;
  const result = promoteSource(sqlite, {
    ...input("v2", [typed]),
    source: { ...source, id: "typed", priority: 20 },
  });
  const after = sqlite.prepare("select id, kind from entities").get() as { id: string; kind: string };

  assert.equal(result.conflictsCreated, 0);
  assert.deepEqual(after, { id: before.id, kind: "mod" });
});

test("higher-priority cited facts remain field winners across provider refreshes", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-priority-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  promoteSource(sqlite, input("v1", [{ ...entity("braton", "Braton", "weapon"), fields: { name: "Braton", slug: "braton", description: "Provider description" } }]));
  const correction: Observation = { type: "entity", kind: "weapon", externalIds: [{ sourceId: "fixture", namespace: "id", value: "braton" }], fields: { description: "Cited correction" }, evidence: { ...evidence("manual-v1", "manual"), citationUrl: "https://example.test/correction" } };
  promoteSource(sqlite, { source: { id: "manual", name: "Manual", homepage: "https://example.test/correction", priority: 300 }, version: "manual-v1", contentHash: "manual", retrievedAt: correction.evidence.retrievedAt, observations: [correction] });
  promoteSource(sqlite, input("v2", [{ ...entity("braton", "Braton", "weapon", "v2"), fields: { name: "Braton", slug: "braton", description: "New provider description" } }]));
  assert.deepEqual(sqlite.prepare("select description from entities where slug = 'braton'").get(), { description: "Cited correction" });
});

test("arcane classes are promoted as cited canonical fields", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-arcane-class-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const arcane = { ...entity("barrier", "Arcane Barrier", "arcane"), fields: { name: "Arcane Barrier", slug: "arcane-barrier", arcaneClass: "warframe" as const } };

  promoteSource(sqlite, input("v1", [arcane]));

  assert.deepEqual(sqlite.prepare("select arcane_class as arcaneClass from entities where slug = 'arcane-barrier'").get(), { arcaneClass: "warframe" });
  assert.deepEqual(sqlite.prepare("select field, source_record_key as recordKey from fact_provenance where field = 'arcaneClass'").get(), { field: "arcaneClass", recordKey: "record" });
});

test("an overlay targeting an unimported provider becomes a reviewable conflict", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-missing-source-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const correction: Observation = {
    type: "entity",
    kind: "weapon",
    externalIds: [{ sourceId: "not-imported", namespace: "id", value: "braton" }],
    fields: { name: "Braton", slug: "braton", description: "Cited correction" },
    evidence: { ...evidence("manual-v1", "manual"), citationUrl: "https://example.test/correction" },
  };
  const result = promoteSource(sqlite, {
    source: { id: "manual", name: "Manual", homepage: "https://example.test/correction", priority: 300 },
    version: "manual-v1",
    contentHash: "manual",
    retrievedAt: correction.evidence.retrievedAt,
    observations: [correction],
  });

  assert.equal(result.conflictsCreated, 1);
  assert.equal(result.entitiesCreated, 0);
  assert.match((sqlite.prepare("select reason from ingestion_conflicts where source_run_id = ?").get(result.sourceRunId) as { reason: string }).reason, /not registered: not-imported/);
});

test("editorial rankings link cited sets to canonical entities", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-promotion-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  promoteSource(sqlite, input("v1", [entity("braton", "Braton", "weapon")]));

  const manualSource = { id: "manual-ranking", name: "Creator ranking", homepage: "https://example.test/video", license: "Citation only", priority: 200 };
  const manualEvidence = { sourceId: manualSource.id, sourceRecordKey: "ranking", snapshotVersion: "manual-v1", retrievedAt: "2026-10-13T12:00:00.000Z", citationUrl: manualSource.homepage };
  const result = promoteSource(sqlite, {
    source: manualSource,
    version: "manual-v1",
    contentHash: "sha256:manual",
    retrievedAt: manualEvidence.retrievedAt,
    observations: [
      { type: "ranking-set", key: "primary-2026", title: "Primary ranking", author: "Creator", publishedAt: "2026-10-01", scope: "Primary weapons", scale: ["S", "A", "B"], licenseNote: "Citation only", evidence: manualEvidence },
      { type: "ranking", setKey: "primary-2026", subjectExternalId: { sourceId: "fixture", namespace: "id", value: "braton" }, tier: "A", timestampSeconds: 120, evidence: manualEvidence },
    ],
  });

  assert.equal(result.rankingSetsCreated, 1);
  assert.equal(result.rankingsCreated, 1);
  assert.deepEqual(sqlite.prepare("select rs.title, er.tier, e.name from editorial_rankings er join ranking_sets rs on rs.id = er.set_id join entities e on e.id = er.entity_id").get(), { title: "Primary ranking", tier: "A", name: "Braton" });
  assert.deepEqual(sqlite.prepare("select rs.source_record_key as setRecord, er.source_record_key as rankingRecord from editorial_rankings er join ranking_sets rs on rs.id = er.set_id").get(), { setRecord: "ranking", rankingRecord: "ranking" });
});

test("typed relations resolve both endpoints and preserve their evidence", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-relations-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const observations = [
    entity("quest", "A Quest", "quest"),
    entity("node", "A Node", "node"),
    { type: "entity-relation", fromExternalId: { sourceId: "fixture", namespace: "id", value: "quest" }, toExternalId: { sourceId: "fixture", namespace: "id", value: "node" }, kind: "occurs-at", notes: "First step", evidence: { ...evidence(), sourceRecordKey: "quest:node", citationUrl: "https://example.test/relation" } },
  ] satisfies Observation[];
  const result = promoteSource(sqlite, input("v1", observations));

  assert.equal(result.relationsCreated, 1);
  assert.deepEqual(sqlite.prepare("select kind, notes, source_record_key as recordKey, citation_url as citationUrl from entity_relations").get(), { kind: "occurs-at", notes: "First step", recordKey: "quest:node", citationUrl: "https://example.test/relation" });
});

test("sourced enhancement options resolve canonical entities and rotate with source runs", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-enhancement-options-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const first = [
    entity("shard", "Crimson Archon Shard", "shard"),
    { type: "enhancement-option", subjectExternalId: { sourceId: "fixture", namespace: "id", value: "shard" }, key: "ability-strength", label: "Ability Strength", evidence: { ...evidence(), sourceRecordKey: "shard:ability-strength", citationUrl: "https://example.test/shards" } },
  ] satisfies Observation[];
  assert.equal(promoteSource(sqlite, input("v1", first)).enhancementOptionsCreated, 1);
  const second = first.map((observation) => ({ ...observation, evidence: { ...observation.evidence, snapshotVersion: "v2" } })) as Observation[];
  promoteSource(sqlite, input("v2", second));
  assert.deepEqual(sqlite.prepare(`
    select option.key, option.label, option.source_record_key as recordKey
    from entity_enhancement_options option join source_runs run on run.id = option.source_run_id
    where run.status = 'active'
  `).get(), { key: "ability-strength", label: "Ability Strength", recordKey: "shard:ability-strength" });
});

function input(version: string, observations: Observation[]) {
  return { source, version, contentHash: `sha256:${version.padEnd(64, "0")}`, retrievedAt: "2026-10-13T12:00:00.000Z", observations };
}

function evidence(version = "v1", sourceId = "fixture") {
  return { sourceId, sourceRecordKey: "record", snapshotVersion: version, retrievedAt: "2026-10-13T12:00:00.000Z" };
}

function entity(id: string, name: string, kind: "unknown" | "component" | "mod" | "node" | "weapon" | "quest" | "shard", version = "v1", sourceId = "fixture"): Observation {
  return { type: "entity", kind, externalIds: [{ sourceId, namespace: "id", value: id }], fields: { name, slug: name.toLowerCase().replaceAll(" ", "-") }, evidence: evidence(version, sourceId) };
}

function drop(version: string, chance: number): Observation {
  return { type: "drop", rewardExternalId: { sourceId: "fixture", namespace: "id", value: "reward" }, nodeExternalId: { sourceId: "fixture", namespace: "id", value: "node" }, locationLabel: "Falling Glory, Venus", chance, evidence: evidence(version) };
}
