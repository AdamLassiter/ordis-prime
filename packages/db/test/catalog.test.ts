import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Observation } from "@ordis-prime/domain";
import {
  createLocalUser,
  findCatalogItem,
  findCatalogNode,
  listSourceStatuses,
  listStarChartNodes,
  migrateDatabase,
  openSqliteDatabase,
  promoteSource,
  searchCatalog,
  searchDiscoveryCatalog,
  setInventoryEntryByReference,
} from "../src/index.ts";

test("catalog read models join active recipes, drops, provenance, and rankings", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-catalog-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const evidence = {
    sourceId: "items",
    sourceRecordKey: "braton",
    snapshotVersion: "v1",
    retrievedAt: "2026-10-13T12:00:00.000Z",
  };
  const external = (value: string) => ({
    sourceId: "items",
    namespace: "id",
    value,
  });
  const observations: Observation[] = [
    {
      type: "entity",
      kind: "weapon",
      externalIds: [external("braton")],
      fields: {
        name: "Braton",
        slug: "braton",
        description: "A balanced rifle.",
        equipmentMaxRank: 30,
      },
      evidence,
    },
    {
      type: "entity",
      kind: "resource",
      externalIds: [external("alloy")],
      fields: { name: "Alloy Plate", slug: "alloy-plate" },
      evidence: { ...evidence, sourceRecordKey: "alloy" },
    },
    {
      type: "entity",
      kind: "node",
      externalIds: [external("caloris")],
      fields: {
        name: "Caloris",
        slug: "mercury-caloris",
        description: "Rescue on Mercury",
      },
      evidence: { ...evidence, sourceRecordKey: "caloris" },
    },
    {
      type: "entity",
      kind: "node",
      externalIds: [external("terminus")],
      fields: { name: "Terminus", slug: "mercury-terminus" },
      evidence: { ...evidence, sourceRecordKey: "terminus" },
    },
    {
      type: "entity",
      kind: "quest",
      externalIds: [external("awakening")],
      fields: {
        name: "Awakening",
        slug: "awakening",
        description: "Begin again.",
      },
      evidence: { ...evidence, sourceRecordKey: "awakening" },
    },
    {
      type: "node-detail",
      nodeExternalId: external("caloris"),
      planet: "Mercury",
      missionType: "Rescue",
      minimumEnemyLevel: 6,
      maximumEnemyLevel: 8,
      evidence: { ...evidence, sourceRecordKey: "caloris" },
    },
    {
      type: "recipe",
      outputExternalId: external("braton"),
      ingredients: [{ externalId: external("alloy"), quantity: 200 }],
      evidence,
    },
    {
      type: "drop",
      rewardExternalId: external("braton"),
      nodeExternalId: external("caloris"),
      locationLabel: "Caloris, Mercury",
      chance: 0.1,
      rotation: "A",
      evidence,
    },
    {
      type: "entity-relation",
      fromExternalId: external("awakening"),
      toExternalId: external("caloris"),
      kind: "occurs-at",
      notes: "The opening mission.",
      evidence: {
        ...evidence,
        sourceRecordKey: "awakening:caloris",
        citationUrl: "https://example.test/quest",
      },
    },
    {
      type: "entity-relation",
      fromExternalId: external("caloris"),
      toExternalId: external("terminus"),
      kind: "connects-to",
      evidence: {
        ...evidence,
        sourceRecordKey: "caloris:terminus",
        citationUrl: "https://example.test/chart",
      },
    },
  ];
  promoteSource(sqlite, {
    source: {
      id: "items",
      name: "Items",
      homepage: "https://example.test/items",
      priority: 10,
    },
    version: "v1",
    contentHash: "hash-1",
    retrievedAt: evidence.retrievedAt,
    observations,
  });
  const rankingEvidence = {
    ...evidence,
    sourceId: "ranking",
    snapshotVersion: "ranking-v1",
  };
  promoteSource(sqlite, {
    source: {
      id: "ranking",
      name: "Ranking",
      homepage: "https://example.test/ranking",
      priority: 20,
    },
    version: "ranking-v1",
    contentHash: "hash-2",
    retrievedAt: evidence.retrievedAt,
    observations: [
      {
        type: "ranking-set",
        key: "set",
        title: "Creator list",
        author: "Creator",
        publishedAt: "2026-10-01",
        scope: "Weapons",
        scale: ["S", "A"],
        licenseNote: "Citation",
        evidence: rankingEvidence,
      },
      {
        type: "ranking",
        setKey: "set",
        subjectExternalId: external("braton"),
        tier: "A",
        timestampSeconds: 42,
        evidence: rankingEvidence,
      },
    ],
  });

  assert.deepEqual(
    searchCatalog(sqlite, "brat").map(({ name }) => name),
    ["Braton"],
  );
  assert.deepEqual(searchCatalog(sqlite, "%"), []);
  assert.deepEqual(
    searchDiscoveryCatalog(sqlite, { kind: "quest" }).map(
      ({ name, relationCount, neighbors }) => ({
        name,
        relationCount,
        neighbors,
      }),
    ),
    [
      {
        name: "Awakening",
        relationCount: 1,
        neighbors: [
          {
            direction: "outgoing",
            relationKind: "occurs-at",
            kind: "node",
            slug: "mercury-caloris",
            name: "Caloris",
            sourceName: "Items",
            citationUrl: "https://example.test/quest",
          },
        ],
      },
    ],
  );
  assert.deepEqual(searchDiscoveryCatalog(sqlite, { query: "%" }), []);
  const item = findCatalogItem(sqlite, "weapon", "braton");
  assert.equal(item?.equipmentMaxRank, 30);
  assert.equal(item?.components[0]?.quantity, 200);
  assert.equal(item?.drops[0]?.nodeSlug, "mercury-caloris");
  assert.equal(item?.sources[0]?.name, "Items");
  assert.deepEqual(item?.rankings[0], {
    title: "Creator list",
    author: "Creator",
    tier: "A",
    timestampSeconds: 42,
    sourceUrl: "https://example.test/ranking",
  });
  assert.equal(
    item?.evidence.some(
      (entry) => entry.fact === "recipe" && entry.recordKey === "braton",
    ),
    true,
  );
  assert.equal(
    item?.evidence.some(
      (entry) => entry.fact === "drop" && entry.recordKey === "braton",
    ),
    true,
  );
  const quest = findCatalogItem(sqlite, "quest", "awakening")!;
  assert.deepEqual(quest.relations[0], {
    direction: "outgoing",
    kind: "occurs-at",
    subject: {
      kind: "node",
      slug: "mercury-caloris",
      name: "Caloris",
      description: "Rescue on Mercury",
    },
    notes: "The opening mission.",
    sourceName: "Items",
    citationUrl: "https://example.test/quest",
  });
  assert.equal(
    quest.evidence.some((entry) => entry.fact === "relation.occurs-at"),
    true,
  );
  const node = findCatalogNode(sqlite, "mercury-caloris")!;
  assert.equal(node.drops[0]?.name, "Braton");
  assert.deepEqual(
    {
      planet: node.planet,
      missionType: node.missionType,
      minimumEnemyLevel: node.minimumEnemyLevel,
      maximumEnemyLevel: node.maximumEnemyLevel,
    },
    {
      planet: "Mercury",
      missionType: "Rescue",
      minimumEnemyLevel: 6,
      maximumEnemyLevel: 8,
    },
  );
  assert.deepEqual(node.connections, [
    { slug: "mercury-terminus", name: "Terminus", planet: undefined },
  ]);
  const userId = createLocalUser(sqlite, { username: "Player" });
  assert.deepEqual(
    listStarChartNodes(sqlite).map(
      ({ name, rewardCount, connectionCount, neededRewardCount }) => ({
        name,
        rewardCount,
        connectionCount,
        neededRewardCount,
      }),
    ),
    [
      {
        name: "Caloris",
        rewardCount: 1,
        connectionCount: 1,
        neededRewardCount: undefined,
      },
      {
        name: "Terminus",
        rewardCount: 0,
        connectionCount: 1,
        neededRewardCount: undefined,
      },
    ],
  );
  assert.deepEqual(
    listStarChartNodes(sqlite, userId).map(
      ({ name, planet, rewardCount, neededRewardCount }) => ({
        name,
        planet,
        rewardCount,
        neededRewardCount,
      }),
    ),
    [
      {
        name: "Caloris",
        planet: "Mercury",
        rewardCount: 1,
        neededRewardCount: 1,
      },
      {
        name: "Terminus",
        planet: undefined,
        rewardCount: 0,
        neededRewardCount: 0,
      },
    ],
  );
  assert.deepEqual(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.drops[0]?.inventory,
    { ownedCount: 0, builtCount: 0, wantedCount: 0, needed: true },
  );
  setInventoryEntryByReference(
    sqlite,
    userId,
    { kind: "weapon", slug: "braton" },
    { ownedCount: 1, builtCount: 0, wantedCount: 0 },
  );
  assert.deepEqual(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.drops[0]?.inventory,
    { ownedCount: 1, builtCount: 0, wantedCount: 0, needed: false },
  );
  assert.deepEqual(
    listSourceStatuses(sqlite).map(({ id, conflictCount }) => ({
      id,
      conflictCount,
    })),
    [
      { id: "ranking", conflictCount: 0 },
      { id: "items", conflictCount: 0 },
    ],
  );
});
