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
  setDiscoveryProgress,
  setInventoryEntryByReference,
  setNodeCompletion,
  setNodeObjectiveCompletion,
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
      type: "equipment-polarity-set",
      subjectExternalId: external("braton"),
      configuration: "Primary",
      polarities: [
        { role: "normal", polarity: "madurai", quantity: 2 },
        { role: "exilus", polarity: "naramon", quantity: 1 },
      ],
      evidence: {
        ...evidence,
        sourceRecordKey: "braton:factory-polarities",
        citationUrl: "https://example.test/braton",
      },
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
      railjackIntrinsicRequirement: 3,
      warframeRankRequirement: 30,
      activeAdversaryRequirement: "kuva-lich",
      evidence: { ...evidence, sourceRecordKey: "caloris" },
    },
    {
      type: "node-item-requirement",
      nodeExternalId: external("caloris"),
      itemExternalId: external("alloy"),
      quantity: 100,
      evidence: {
        ...evidence,
        sourceRecordKey: "caloris:alloy",
        citationUrl: "https://example.test/caloris-access",
      },
    },
    {
      type: "node-objective",
      nodeExternalId: external("caloris"),
      key: "open-lockers",
      sourceId: "items",
      label: "Open 3 lockers",
      hint: "Explore the whole mission.",
      sortOrder: 0,
      evidence: {
        ...evidence,
        sourceRecordKey: "caloris:objective:open-lockers",
        citationUrl: "https://example.test/caloris-objectives",
      },
    },
    {
      type: "node-reward",
      nodeExternalId: external("caloris"),
      rewardExternalId: external("alloy"),
      key: "alloy-reward",
      label: "100 Alloy Plate",
      quantity: 100,
      trigger: "objective",
      objectiveKey: "open-lockers",
      sortOrder: 0,
      evidence: {
        ...evidence,
        sourceRecordKey: "caloris:reward:alloy",
        citationUrl: "https://example.test/caloris-objectives",
      },
    },
    {
      type: "node-reward",
      nodeExternalId: external("caloris"),
      key: "unlock-reward",
      label: "Unlock the next planet",
      trigger: "junction-completion",
      sortOrder: 1,
      evidence: {
        ...evidence,
        sourceRecordKey: "caloris:reward:unlock",
        citationUrl: "https://example.test/caloris-objectives",
      },
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
  assert.deepEqual(item?.factoryPolaritySets, [
    {
      configuration: "Primary",
      polarities: [
        { role: "normal", polarity: "madurai", quantity: 2 },
        { role: "exilus", polarity: "naramon", quantity: 1 },
      ],
      sourceName: "Items",
      citationUrl: "https://example.test/braton",
    },
  ]);
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
  const alloy = findCatalogItem(sqlite, "resource", "alloy-plate")!;
  assert.deepEqual(alloy.requiredForNodeAccess, [
    {
      nodeSlug: "mercury-caloris",
      nodeName: "Caloris",
      quantity: 100,
      sourceName: "Items",
      citationUrl: "https://example.test/caloris-access",
    },
  ]);
  assert.deepEqual(alloy.junctionRewards, [
    {
      nodeSlug: "mercury-caloris",
      nodeName: "Caloris",
      label: "100 Alloy Plate",
      quantity: 100,
      trigger: "objective",
      sourceName: "Items",
      citationUrl: "https://example.test/caloris-objectives",
    },
  ]);
  assert.equal(
    alloy.evidence.some(
      (entry) =>
        entry.fact === "node-item-requirement" &&
        entry.recordKey === "caloris:alloy",
    ),
    true,
  );
  assert.equal(
    item?.evidence.some(
      (entry) =>
        entry.fact === "factory-polarity-set" &&
        entry.recordKey === "braton:factory-polarities",
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
      railjackIntrinsicRequirement: node.railjackIntrinsicRequirement,
      warframeRankRequirement: node.warframeRankRequirement,
      activeAdversaryRequirement: node.activeAdversaryRequirement,
    },
    {
      planet: "Mercury",
      missionType: "Rescue",
      minimumEnemyLevel: 6,
      maximumEnemyLevel: 8,
      railjackIntrinsicRequirement: 3,
      warframeRankRequirement: 30,
      activeAdversaryRequirement: "kuva-lich",
    },
  );
  assert.deepEqual(node.connections, [
    { slug: "mercury-terminus", name: "Terminus", planet: undefined },
  ]);
  assert.deepEqual(node.itemRequirements, [
    {
      kind: "resource",
      slug: "alloy-plate",
      name: "Alloy Plate",
      requiredCount: 100,
      sourceName: "Items",
      citationUrl: "https://example.test/caloris-access",
    },
  ]);
  assert.deepEqual(node.objectives, [
    {
      sourceId: "items",
      key: "open-lockers",
      label: "Open 3 lockers",
      hint: "Explore the whole mission.",
      sourceName: "Items",
      citationUrl: "https://example.test/caloris-objectives",
    },
  ]);
  assert.deepEqual(node.oneTimeRewards, [
    {
      key: "alloy-reward",
      label: "100 Alloy Plate",
      quantity: 100,
      trigger: "objective",
      objectiveKey: "open-lockers",
      sortOrder: 0,
      sourceName: "Items",
      citationUrl: "https://example.test/caloris-objectives",
      entity: {
        kind: "resource",
        slug: "alloy-plate",
        name: "Alloy Plate",
        description: undefined,
      },
    },
    {
      key: "unlock-reward",
      label: "Unlock the next planet",
      quantity: undefined,
      trigger: "junction-completion",
      objectiveKey: undefined,
      sortOrder: 1,
      sourceName: "Items",
      citationUrl: "https://example.test/caloris-objectives",
      entity: undefined,
    },
  ]);
  const userId = createLocalUser(sqlite, { username: "Player" });
  assert.equal(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.objectives[0]
      ?.completionState,
    "incomplete",
  );
  setNodeObjectiveCompletion(
    sqlite,
    userId,
    {
      slug: "mercury-caloris",
      sourceId: "items",
      objectiveKey: "open-lockers",
    },
    true,
  );
  assert.equal(
    listStarChartNodes(sqlite, userId).find(
      ({ slug }) => slug === "mercury-caloris",
    )?.objectives[0]?.completionState,
    "completed",
  );
  assert.equal(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.completionState,
    "incomplete",
  );
  assert.deepEqual(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.itemRequirements,
    [
      {
        kind: "resource",
        slug: "alloy-plate",
        name: "Alloy Plate",
        requiredCount: 100,
        ownedCount: 0,
        state: "blocked",
        sourceName: "Items",
        citationUrl: "https://example.test/caloris-access",
      },
    ],
  );
  assert.deepEqual(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.oneTimeRewards.map(
      ({ label, inventory }) => ({ label, inventory }),
    ),
    [
      {
        label: "100 Alloy Plate",
        inventory: {
          ownedCount: 0,
          builtCount: 0,
          wantedCount: 0,
          needed: true,
        },
      },
      { label: "Unlock the next planet", inventory: undefined },
    ],
  );
  setNodeCompletion(sqlite, userId, "mercury-caloris", true);
  assert.equal(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.completionState,
    "completed",
  );
  assert.deepEqual(
    listStarChartNodes(sqlite).map(
      ({
        name,
        rewardCount,
        oneTimeRewardCount,
        connectionCount,
        neededRewardCount,
        neededOneTimeRewardCount,
      }) => ({
        name,
        rewardCount,
        oneTimeRewardCount,
        connectionCount,
        neededRewardCount,
        neededOneTimeRewardCount,
      }),
    ),
    [
      {
        name: "Caloris",
        rewardCount: 1,
        oneTimeRewardCount: 2,
        connectionCount: 1,
        neededRewardCount: undefined,
        neededOneTimeRewardCount: undefined,
      },
      {
        name: "Terminus",
        rewardCount: 0,
        oneTimeRewardCount: 0,
        connectionCount: 1,
        neededRewardCount: undefined,
        neededOneTimeRewardCount: undefined,
      },
    ],
  );
  assert.deepEqual(
    listStarChartNodes(sqlite, userId).map(
      ({
        name,
        planet,
        rewardCount,
        oneTimeRewardCount,
        neededRewardCount,
        neededOneTimeRewardCount,
        completionState,
      }) => ({
        name,
        planet,
        rewardCount,
        oneTimeRewardCount,
        neededRewardCount,
        neededOneTimeRewardCount,
        completionState,
      }),
    ),
    [
      {
        name: "Caloris",
        planet: "Mercury",
        rewardCount: 1,
        oneTimeRewardCount: 2,
        neededRewardCount: 1,
        neededOneTimeRewardCount: 1,
        completionState: "completed",
      },
      {
        name: "Terminus",
        planet: undefined,
        rewardCount: 0,
        oneTimeRewardCount: 0,
        neededRewardCount: 0,
        neededOneTimeRewardCount: 0,
        completionState: "incomplete",
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
  setInventoryEntryByReference(
    sqlite,
    userId,
    { kind: "resource", slug: "alloy-plate" },
    { ownedCount: 100, builtCount: 0, wantedCount: 0 },
  );
  assert.equal(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.itemRequirements[0]
      ?.state,
    "met",
  );
  assert.deepEqual(
    findCatalogNode(sqlite, "mercury-caloris", userId)?.oneTimeRewards[0]
      ?.inventory,
    { ownedCount: 100, builtCount: 0, wantedCount: 0, needed: false },
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

test("node reads expose cited access requirements and private progress", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-node-access-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const evidence = {
    sourceId: "access",
    sourceRecordKey: "node:quest",
    snapshotVersion: "v1",
    retrievedAt: "2026-10-19T12:00:00.000Z",
    citationUrl: "https://example.test/access",
  };
  const external = (value: string) => ({
    sourceId: "access",
    namespace: "id",
    value,
  });
  promoteSource(sqlite, {
    source: {
      id: "access",
      name: "Access source",
      homepage: "https://example.test",
      priority: 10,
    },
    version: "v1",
    contentHash: "access-hash",
    retrievedAt: evidence.retrievedAt,
    observations: [
      {
        type: "entity",
        kind: "node",
        externalIds: [external("ganymede")],
        fields: { name: "Ganymede", slug: "ganymede" },
        evidence,
      },
      {
        type: "entity",
        kind: "quest",
        externalIds: [external("natah")],
        fields: { name: "Natah", slug: "natah" },
        evidence,
      },
      {
        type: "entity",
        kind: "node",
        externalIds: [external("lower-vehrvod")],
        fields: { name: "Lower Vehrvod", slug: "lower-vehrvod" },
        evidence,
      },
      {
        type: "entity-relation",
        kind: "requires",
        fromExternalId: external("ganymede"),
        toExternalId: external("natah"),
        evidence,
      },
      {
        type: "entity-relation",
        kind: "requires",
        fromExternalId: external("ganymede"),
        toExternalId: external("lower-vehrvod"),
        evidence,
      },
    ],
  });

  assert.deepEqual(findCatalogNode(sqlite, "ganymede")?.accessRequirements, [
    {
      kind: "node",
      slug: "lower-vehrvod",
      name: "Lower Vehrvod",
      relationKind: "requires",
      sourceName: "Access source",
      citationUrl: "https://example.test/access",
    },
    {
      kind: "quest",
      slug: "natah",
      name: "Natah",
      relationKind: "requires",
      sourceName: "Access source",
      citationUrl: "https://example.test/access",
    },
  ]);
  const userId = createLocalUser(sqlite, { username: "AccessPlayer" });
  assert.equal(
    findCatalogNode(sqlite, "ganymede", userId)?.accessRequirements.find(
      ({ kind }) => kind === "quest",
    )?.progressState,
    "unseen",
  );
  assert.equal(
    findCatalogNode(sqlite, "ganymede", userId)?.accessRequirements.find(
      ({ kind }) => kind === "node",
    )?.progressState,
    "incomplete",
  );
  setDiscoveryProgress(
    sqlite,
    userId,
    { kind: "quest", slug: "natah" },
    "completed",
  );
  assert.equal(
    findCatalogNode(sqlite, "ganymede", userId)?.accessRequirements.find(
      ({ kind }) => kind === "quest",
    )?.progressState,
    "completed",
  );
  setNodeCompletion(sqlite, userId, "lower-vehrvod", true);
  assert.equal(
    findCatalogNode(sqlite, "ganymede", userId)?.accessRequirements.find(
      ({ kind }) => kind === "node",
    )?.progressState,
    "completed",
  );
});
