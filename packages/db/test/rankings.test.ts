import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Observation } from "@ordis-prime/domain";
import { compareEditorialRankings, migrateDatabase, openSqliteDatabase, promoteSource } from "../src/index.ts";

test("ranking comparison preserves independent scales, citations, and disagreement", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-rankings-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "rankings.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const retrievedAt = "2026-10-13T12:00:00.000Z";
  const entityEvidence = { sourceId: "items", sourceRecordKey: "braton", snapshotVersion: "v1", retrievedAt };
  promoteSource(database, { source: { id: "items", name: "Items", homepage: "https://items.test", priority: 10 }, version: "v1", contentHash: "items", retrievedAt, observations: [{ type: "entity", kind: "weapon", externalIds: [{ sourceId: "items", namespace: "id", value: "braton" }], fields: { name: "Braton", slug: "braton" }, evidence: entityEvidence }] });
  for (const [id, tier, scale] of [["creator-one", "S", ["S", "A", "B"]], ["creator-two", "Low", ["Top", "Mid", "Low"]]] as const) {
    const evidence = { sourceId: id, sourceRecordKey: id, snapshotVersion: "v1", retrievedAt, citationUrl: `https://${id}.test/video` };
    const observations: Observation[] = [
      { type: "ranking-set", key: id, title: id, author: id, publishedAt: "2026-10-01", scope: "Weapons", scale: [...scale], licenseNote: "cited", evidence },
      { type: "ranking", setKey: id, subjectExternalId: { sourceId: "items", namespace: "id", value: "braton" }, tier, evidence },
    ];
    promoteSource(database, { source: { id, name: id, homepage: `https://${id}.test`, priority: 20 }, version: "v1", contentHash: id, retrievedAt, observations });
  }
  const comparison = compareEditorialRankings(database, { query: "Brat" });
  assert.deepEqual(comparison.sets.map(({ title, scale, citationUrl }) => ({ title, scale, citationUrl })), [
    { title: "creator-one", scale: ["S", "A", "B"], citationUrl: "https://creator-one.test/video" },
    { title: "creator-two", scale: ["Top", "Mid", "Low"], citationUrl: "https://creator-two.test/video" },
  ]);
  assert.deepEqual(Object.values(comparison.rows[0]!.rankings).map(({ tier }) => tier).sort(), ["Low", "S"]);
  const selected = compareEditorialRankings(database, { setIds: [comparison.sets[0]!.id] });
  assert.equal(selected.sets.length, 1);
  assert.deepEqual(Object.values(selected.rows[0]!.rankings).map(({ tier }) => tier), ["S"]);
  assert.equal(compareEditorialRankings(database, { query: "%" }).rows.length, 0);
});
