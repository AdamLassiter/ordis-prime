import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { Observation } from "@ordis-prime/domain";
import {
  migrateDatabase,
  previewSourcePromotion,
  promoteSource,
  pruneInactiveCatalogHistory,
} from "../src/index.ts";

const source = {
  id: "fixture",
  name: "Fixture",
  homepage: "https://example.test",
  license: "CC0",
  priority: 10,
};

test("source previews execute promotion validation and roll back every write", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-preview-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const preview = previewSourcePromotion(
    sqlite,
    input("v1", [entity("reward", "Ash Chassis", "component")]),
  );
  assert.equal(preview.entitiesCreated, 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select (select count(*) from sources) as sources, (select count(*) from source_runs) as runs, (select count(*) from entities) as entities, (select count(*) from catalog_releases) as releases",
      )
      .get(),
    { sources: 0, runs: 0, entities: 0, releases: 0 },
  );
  assert.equal(
    promoteSource(
      sqlite,
      input("v1", [entity("reward", "Ash Chassis", "component")]),
    ).entitiesCreated,
    1,
  );
});

test("promotion rejects evidence outside the source snapshot envelope", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-evidence-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const valid = entity("reward", "Ash Chassis", "component");

  for (const [evidenceOverrides, message] of [
    [{ sourceId: "other" }, /does not match the promoted source snapshot/],
    [
      { snapshotVersion: "other" },
      /does not match the promoted source snapshot/,
    ],
    [{ sourceRecordKey: "   " }, /source record key is required/],
    [
      { retrievedAt: "2026-10-13T12:00:01.000Z" },
      /retrieval time does not match/,
    ],
    [{ retrievedAt: "not-a-date" }, /retrieval time does not match/],
  ] as const) {
    assert.throws(
      () =>
        promoteSource(
          sqlite,
          input("v1", [
            {
              ...valid,
              evidence: { ...valid.evidence, ...evidenceOverrides },
            },
          ]),
        ),
      message,
    );
  }
  assert.deepEqual(
    sqlite
      .prepare(
        "select (select count(*) from sources) as sources, (select count(*) from source_runs) as runs",
      )
      .get(),
    { sources: 0, runs: 0 },
  );
});

test("promotion atomically replaces the active source run while preserving entity IDs", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-promotion-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const first = promoteSource(
    sqlite,
    input("v1", [
      entity("reward", "Ash Chassis", "component"),
      entity("node", "Falling Glory", "node"),
      drop("v1", 0.1),
    ]),
  );
  const stableId = (
    sqlite
      .prepare("select id from entities where name = 'Ash Chassis'")
      .get() as { id: string }
  ).id;
  const second = promoteSource(
    sqlite,
    input("v2", [
      entity("reward", "Ash Prime Chassis", "component", "v2"),
      entity("node", "Falling Glory", "node", "v2"),
      drop("v2", 0.2),
    ]),
  );

  assert.equal(first.entitiesCreated, 2);
  assert.equal(second.entitiesMatched, 2);
  assert.equal(
    (
      sqlite
        .prepare("select id from entities where name = 'Ash Prime Chassis'")
        .get() as { id: string }
    ).id,
    stableId,
  );
  assert.deepEqual(
    sqlite
      .prepare("select version, status from source_runs order by version")
      .all(),
    [
      { version: "v1", status: "staged" },
      { version: "v2", status: "active" },
    ],
  );
  assert.equal(
    (
      sqlite
        .prepare(
          "select count(*) as count from catalog_releases where active = 1",
        )
        .get() as { count: number }
    ).count,
    1,
  );
  assert.equal(
    (
      sqlite
        .prepare(
          "select count(*) as count from drops d join source_runs r on r.id = d.source_run_id where r.status = 'active'",
        )
        .get() as { count: number }
    ).count,
    1,
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select source_record_key as recordKey from drops d join source_runs r on r.id = d.source_run_id where r.status = 'active'",
      )
      .get(),
    { recordKey: "record" },
  );
  assert.equal(
    promoteSource(
      sqlite,
      input("v2", [
        entity("reward", "Ash Prime Chassis", "component", "v2"),
        entity("node", "Falling Glory", "node", "v2"),
        drop("v2", 0.2),
      ]),
    ).entitiesCreated,
    0,
  );

  assert.throws(
    () =>
      promoteSource(
        sqlite,
        input("v3", [
          entity("reward", "Broken", "component", "v3"),
          { ...drop("v3", 2), chance: 2 },
        ]),
      ),
    /outside/,
  );
  assert.equal(
    (
      sqlite.prepare("select count(*) as count from source_runs").get() as {
        count: number;
      }
    ).count,
    2,
  );
  assert.equal(
    (
      sqlite
        .prepare("select name from entities where id = ?")
        .get(stableId) as { name: string }
    ).name,
    "Ash Prime Chassis",
  );

  const colliding = [
    {
      ...entity("collision-a", "Collision A", "component", "v4"),
      fields: { name: "Collision A", slug: "same-slug" },
    },
    {
      ...entity("collision-b", "Collision B", "component", "v4"),
      fields: { name: "Collision B", slug: "same-slug" },
    },
  ] satisfies Observation[];
  assert.throws(
    () => promoteSource(sqlite, input("v4", colliding)),
    /Candidate slug component:same-slug has conflicting names/,
  );
  assert.equal(
    (
      sqlite.prepare("select count(*) as count from source_runs").get() as {
        count: number;
      }
    ).count,
    2,
  );
  assert.equal(
    (
      sqlite
        .prepare(
          "select count(*) as count from entities where slug = 'same-slug'",
        )
        .get() as { count: number }
    ).count,
    0,
  );
  assert.equal(
    (
      sqlite
        .prepare("select version from source_runs where status = 'active'")
        .get() as { version: string }
    ).version,
    "v2",
  );
});

test("canonical slug drift fails with source record context", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-slug-drift-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("v1", [
      entity("renamed", "Original", "component"),
      entity("existing", "Target", "component"),
    ]),
  );
  const renamed = {
    ...entity("renamed", "Target", "component", "v2"),
    evidence: {
      ...evidence("v2"),
      sourceRecordKey: "provider/renamed",
    },
  } satisfies Observation;

  assert.throws(
    () => promoteSource(sqlite, input("v2", [renamed])),
    /from provider\/renamed to component:target/,
  );
  assert.deepEqual(
    sqlite
      .prepare("select version, status from source_runs order by version")
      .all(),
    [{ version: "v1", status: "active" }],
  );
});

test("source-specific shrinkage policy preserves the last healthy run", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-shrinkage-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const first = input("v1", [
    entity("one", "One", "component"),
    entity("two", "Two", "component"),
    entity("three", "Three", "component"),
    entity("four", "Four", "component"),
  ]);
  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...first,
        minimumRetainedObservationRatio: 1.01,
      }),
    /must be between 0 and 1/,
  );
  promoteSource(sqlite, {
    ...first,
    minimumRetainedObservationRatio: 0.5,
  });
  const truncated = input("v2", [entity("one", "One", "component", "v2")]);

  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...truncated,
        minimumRetainedObservationRatio: 0.5,
      }),
    /produced 1 observations; minimum is 2 from previous 4/,
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select version, observation_count as observationCount, status from source_runs",
      )
      .all(),
    [{ version: "v1", observationCount: 4, status: "active" }],
  );

  promoteSource(sqlite, truncated);
  assert.deepEqual(
    sqlite
      .prepare(
        "select version, observation_count as observationCount, status from source_runs order by version",
      )
      .all(),
    [
      { version: "v1", observationCount: 4, status: "staged" },
      { version: "v2", observationCount: 1, status: "active" },
    ],
  );
});

test("candidate-wide validation rejects contradictory and duplicate source facts before staging", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-candidate-validation-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const duplicateNodeDetails = [
    entity("node", "Falling Glory", "node"),
    {
      type: "node-detail",
      nodeExternalId: { sourceId: "fixture", namespace: "id", value: "node" },
      planet: "Venus",
      evidence: { ...evidence(), sourceRecordKey: "node:first" },
    },
    {
      type: "node-detail",
      nodeExternalId: { sourceId: "fixture", namespace: "id", value: "node" },
      planet: "Mars",
      evidence: { ...evidence(), sourceRecordKey: "node:second" },
    },
  ] satisfies Observation[];
  assert.throws(
    () => promoteSource(sqlite, input("v1", duplicateNodeDetails)),
    /Candidate fact node-detail.*node:first and node:second/,
  );

  const incompleteRanking = [
    {
      type: "ranking",
      setKey: "missing",
      subjectExternalId: {
        sourceId: "fixture",
        namespace: "id",
        value: "weapon",
      },
      tier: "S",
      evidence: { ...evidence(), sourceRecordKey: "ranking:weapon" },
    },
  ] satisfies Observation[];
  assert.throws(
    () => promoteSource(sqlite, input("v1", incompleteRanking)),
    /refers to undeclared set missing/,
  );
  assert.throws(
    () =>
      promoteSource(
        sqlite,
        input("v1", [
          entity("node", "Falling Glory", "node"),
          {
            type: "node-detail",
            nodeExternalId: {
              sourceId: "fixture",
              namespace: "id",
              value: "node",
            },
            planet: "Venus",
            activeAdversaryRequirement: "wolf" as never,
            evidence: { ...evidence(), sourceRecordKey: "node:adversary" },
          },
        ]),
      ),
    /active adversary requirement is invalid/,
  );
  assert.throws(
    () =>
      promoteSource(
        sqlite,
        input("v1", [
          entity("node", "Falling Glory", "node"),
          {
            type: "node-detail",
            nodeExternalId: {
              sourceId: "fixture",
              namespace: "id",
              value: "node",
            },
            planet: "Venus",
            warframeRankRequirement: 31,
            evidence: { ...evidence(), sourceRecordKey: "node:warframe-rank" },
          },
        ]),
      ),
    /Warframe rank requirement cannot exceed 30/,
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select (select count(*) from sources) as sources, (select count(*) from source_runs) as runs",
      )
      .get(),
    { sources: 0, runs: 0 },
  );
});

test("each catalog release records its complete active source-run composition", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-releases-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const firstA = promoteSource(
    sqlite,
    input("a-v1", [entity("a", "Source A", "component", "a-v1")]),
  );
  const sourceB = { ...source, id: "fixture-b", name: "Fixture B" };
  const firstB = promoteSource(sqlite, {
    ...input("b-v1", [
      entity("b", "Source B", "component", "b-v1", "fixture-b"),
    ]),
    source: sourceB,
  });
  const secondA = promoteSource(
    sqlite,
    input("a-v2", [entity("a", "Source A revised", "component", "a-v2")]),
  );

  const releaseMembers = sqlite.prepare(`
    select member.source_id as sourceId, run.version
    from catalog_release_sources member join source_runs run on run.id = member.source_run_id
    where member.release_id = ? order by member.source_id
  `);
  assert.deepEqual(releaseMembers.all(firstA.releaseId), [
    { sourceId: "fixture", version: "a-v1" },
  ]);
  assert.deepEqual(releaseMembers.all(firstB.releaseId), [
    { sourceId: "fixture", version: "a-v1" },
    { sourceId: "fixture-b", version: "b-v1" },
  ]);
  assert.deepEqual(releaseMembers.all(secondA.releaseId), [
    { sourceId: "fixture", version: "a-v2" },
    { sourceId: "fixture-b", version: "b-v1" },
  ]);
  assert.equal(
    promoteSource(
      sqlite,
      input("a-v2", [entity("a", "Source A revised", "component", "a-v2")]),
    ).releaseId,
    secondA.releaseId,
  );
});

test("composed validation rejects retirement of entities referenced by another active source", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-composed-validation-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const first = promoteSource(
    sqlite,
    input("a-v1", [entity("reward", "Shared Reward", "component", "a-v1")]),
  );
  const sourceB = { ...source, id: "fixture-b", name: "Fixture B" };
  const crossSourceDrop: Observation = {
    type: "drop",
    rewardExternalId: { sourceId: "fixture", namespace: "id", value: "reward" },
    locationLabel: "External location",
    chance: 0.1,
    evidence: evidence("b-v1", "fixture-b"),
  };
  promoteSource(sqlite, {
    ...input("b-v1", [crossSourceDrop]),
    source: sourceB,
  });

  const tombstone: Observation = {
    type: "entity",
    kind: "component",
    externalIds: [{ sourceId: "fixture", namespace: "id", value: "reward" }],
    fields: {},
    tombstone: true,
    evidence: evidence("a-v2"),
  };
  assert.throws(
    () => promoteSource(sqlite, input("a-v2", [tombstone])),
    /Composed catalog drop reward record references retired component:shared-reward/,
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select source_id as sourceId, version, status from source_runs order by source_id",
      )
      .all(),
    [
      { sourceId: "fixture", version: "a-v1", status: "active" },
      { sourceId: "fixture-b", version: "b-v1", status: "active" },
    ],
  );
  assert.equal(
    (
      sqlite
        .prepare("select retired from entities where slug = 'shared-reward'")
        .get() as { retired: number }
    ).retired,
    0,
  );
  assert.equal(
    first.sourceRunId,
    (
      sqlite
        .prepare("select id from source_runs where source_id = 'fixture'")
        .get() as { id: string }
    ).id,
  );
});

test("composed validation enforces node-typed fact endpoints across sources", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-composed-node-types-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("a-v1", [entity("weapon", "Definitely A Weapon", "weapon", "a-v1")]),
  );
  const sourceB = { ...source, id: "fixture-b", name: "Fixture B" };
  const invalidDrop: Observation = {
    type: "drop",
    rewardExternalId: { sourceId: "fixture", namespace: "id", value: "weapon" },
    nodeExternalId: { sourceId: "fixture", namespace: "id", value: "weapon" },
    locationLabel: "Invalid node",
    evidence: evidence("b-v1", "fixture-b"),
  };
  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...input("b-v1", [invalidDrop]),
        source: sourceB,
      }),
    /Composed catalog drop node record requires a node but resolved weapon:definitely-a-weapon/,
  );
  assert.deepEqual(
    sqlite
      .prepare("select source_id as sourceId, version, status from source_runs")
      .all(),
    [{ sourceId: "fixture", version: "a-v1", status: "active" }],
  );
  assert.equal(
    (
      sqlite.prepare("select count(*) as count from drops").get() as {
        count: number;
      }
    ).count,
    0,
  );
});

test("composed validation requires shard enhancement subjects across sources", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-composed-enhancement-types-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("a-v1", [entity("weapon", "Definitely A Weapon", "weapon", "a-v1")]),
  );
  const sourceB = { ...source, id: "fixture-b", name: "Fixture B" };
  const invalidOption: Observation = {
    type: "enhancement-option",
    subjectExternalId: {
      sourceId: "fixture",
      namespace: "id",
      value: "weapon",
    },
    key: "ability-strength",
    label: "Ability Strength",
    evidence: {
      ...evidence("b-v1", "fixture-b"),
      sourceRecordKey: "weapon:ability-strength",
    },
  };

  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...input("b-v1", [invalidOption]),
        source: sourceB,
      }),
    /Composed catalog enhancement option weapon:ability-strength requires a shard but resolved weapon:definitely-a-weapon/,
  );
  assert.deepEqual(
    sqlite
      .prepare("select source_id as sourceId, version, status from source_runs")
      .all(),
    [{ sourceId: "fixture", version: "a-v1", status: "active" }],
  );
  assert.equal(
    (
      sqlite
        .prepare("select count(*) as count from entity_enhancement_options")
        .get() as { count: number }
    ).count,
    0,
  );
});

test("composed validation requires equipment polarity set subjects", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-composed-equipment-polarities-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("a-v1", [
      entity("part", "Definitely A Component", "component", "a-v1"),
    ]),
  );
  const sourceB = { ...source, id: "fixture-b", name: "Fixture B" };
  const invalidSet: Observation = {
    type: "equipment-polarity-set",
    subjectExternalId: {
      sourceId: "fixture",
      namespace: "id",
      value: "part",
    },
    polarities: [{ role: "normal", polarity: "madurai", quantity: 1 }],
    evidence: {
      ...evidence("b-v1", "fixture-b"),
      sourceRecordKey: "part:factory-polarities",
    },
  };

  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...input("b-v1", [invalidSet]),
        source: sourceB,
      }),
    /equipment polarity set part:factory-polarities requires equipment but resolved component:definitely-a-component/,
  );
  assert.equal(
    (
      sqlite
        .prepare("select count(*) as count from equipment_polarity_sets")
        .get() as { count: number }
    ).count,
    0,
  );
});

test("node item requirements preserve quantities and require inventory items", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-node-item-requirements-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const requirement = (
    item: string,
    quantity: number,
    version = "v1",
    sourceId = "fixture",
  ): Observation => ({
    type: "node-item-requirement",
    nodeExternalId: { sourceId: "fixture", namespace: "id", value: "node" },
    itemExternalId: { sourceId: "fixture", namespace: "id", value: item },
    quantity,
    evidence: {
      ...evidence(version, sourceId),
      sourceRecordKey: `node:item:${item}`,
    },
  });
  const promoted = promoteSource(
    sqlite,
    input("v1", [
      entity("node", "Node", "node"),
      entity("token", "Token", "component"),
      entity("quest", "Quest", "quest"),
      requirement("token", 5),
    ]),
  );
  assert.equal(promoted.nodeItemRequirementsCreated, 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select quantity, source_record_key as recordKey from node_item_requirements",
      )
      .get(),
    { quantity: 5, recordKey: "node:item:token" },
  );

  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...input("bad", [requirement("quest", 1, "bad", "fixture-b")]),
        source: { ...source, id: "fixture-b" },
      }),
    /node item requirement node:item:quest requires an inventory item but resolved quest:quest/,
  );
  assert.throws(
    () =>
      promoteSource(sqlite, input("zero", [requirement("token", 0, "zero")])),
    /quantity must be a positive safe integer/,
  );
});

test("node objectives preserve stable keys and ordered cited text", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-node-objectives-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const objective = (sortOrder: number, version = "v1"): Observation => ({
    type: "node-objective",
    nodeExternalId: { sourceId: "fixture", namespace: "id", value: "node" },
    key: "scan-targets",
    label: "Scan three targets",
    hint: "Equip a Codex Scanner.",
    sortOrder,
    evidence: {
      ...evidence(version),
      sourceRecordKey: "node:objective:scan-targets",
      citationUrl: "https://example.test/node",
    },
  });
  const promoted = promoteSource(
    sqlite,
    input("v1", [
      entity("node", "Node", "node"),
      entity("token", "Token", "resource"),
      objective(2),
      {
        type: "node-reward",
        nodeExternalId: {
          sourceId: "fixture",
          namespace: "id",
          value: "node",
        },
        rewardExternalId: {
          sourceId: "fixture",
          namespace: "id",
          value: "token",
        },
        key: "token-reward",
        label: "5 Token",
        quantity: 5,
        trigger: "objective",
        objectiveKey: "scan-targets",
        sortOrder: 0,
        evidence: {
          ...evidence("v1"),
          sourceRecordKey: "node:reward:token",
        },
      },
    ]),
  );
  assert.equal(promoted.nodeObjectivesCreated, 1);
  assert.equal(promoted.nodeRewardsCreated, 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select key, label, hint, sort_order as sortOrder, citation_url as citationUrl from node_objectives",
      )
      .get(),
    {
      key: "scan-targets",
      label: "Scan three targets",
      hint: "Equip a Codex Scanner.",
      sortOrder: 2,
      citationUrl: "https://example.test/node",
    },
  );
  assert.throws(
    () => promoteSource(sqlite, input("bad", [objective(-1, "bad")])),
    /sort order must be a non-negative integer/,
  );
  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...input("missing-objective", [
          {
            type: "node-reward",
            nodeExternalId: {
              sourceId: "fixture",
              namespace: "id",
              value: "node",
            },
            key: "orphan-reward",
            label: "Orphan reward",
            trigger: "objective",
            objectiveKey: "missing",
            sortOrder: 0,
            evidence: {
              ...evidence("missing-objective", "fixture-b"),
              sourceRecordKey: "node:reward:orphan",
            },
          },
        ]),
        source: { ...source, id: "fixture-b" },
      }),
    /refers to a missing objective/,
  );
});

test("composed validation rejects recipe cycles across sources", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-composed-recipe-cycle-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const recipe = (
    version: string,
    sourceId: string,
    output: string,
    ingredient: string,
  ): Observation => ({
    type: "recipe",
    outputExternalId: { sourceId: "fixture", namespace: "id", value: output },
    ingredients: [
      {
        externalId: {
          sourceId: "fixture",
          namespace: "id",
          value: ingredient,
        },
        quantity: 1,
      },
    ],
    evidence: {
      ...evidence(version, sourceId),
      sourceRecordKey: `${output}-from-${ingredient}`,
    },
  });

  promoteSource(
    sqlite,
    input("a-v1", [
      entity("a", "Resource A", "component", "a-v1"),
      entity("b", "Resource B", "component", "a-v1"),
      recipe("a-v1", "fixture", "a", "b"),
    ]),
  );
  const sourceB = { ...source, id: "fixture-b", name: "Fixture B" };
  assert.throws(
    () =>
      promoteSource(sqlite, {
        ...input("b-v1", [recipe("b-v1", "fixture-b", "b", "a")]),
        source: sourceB,
      }),
    /Composed catalog recipe graph contains a cycle at component:resource-[ab]/,
  );
  assert.deepEqual(
    sqlite
      .prepare("select source_id as sourceId, version, status from source_runs")
      .all(),
    [{ sourceId: "fixture", version: "a-v1", status: "active" }],
  );
  assert.equal(
    (
      sqlite.prepare("select count(*) as count from recipes").get() as {
        count: number;
      }
    ).count,
    1,
  );
});

test("catalog pruning retains active and recent releases while protecting conflict runs", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-release-prune-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  const first = promoteSource(
    sqlite,
    input("v1", [
      entity("reward", "Reward", "component", "v1"),
      entity("node", "Node", "node", "v1"),
      drop("v1", 0.1),
    ]),
  );
  sqlite
    .prepare(
      "insert into source_refreshes (id, source_id, source_run_id, status, started_at, finished_at, snapshot_path, records_processed) values ('refresh-v1', 'fixture', ?, 'succeeded', 1, 2, '/v1', 3)",
    )
    .run(first.sourceRunId);
  const second = promoteSource(
    sqlite,
    input("v2", [
      entity("reward", "Reward", "component", "v2"),
      entity("node", "Node", "node", "v2"),
      drop("v2", 0.2),
    ]),
  );
  const third = promoteSource(
    sqlite,
    input("v3", [
      entity("reward", "Reward", "component", "v3"),
      entity("node", "Node", "node", "v3"),
      drop("v3", 0.3),
    ]),
  );
  sqlite
    .prepare(
      "insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('conflict-run', 'fixture', 'conflict', 'hash', 0, 'staged')",
    )
    .run();
  sqlite
    .prepare(
      "insert into ingestion_conflicts (id, source_run_id, record_key, reason, candidates_json) values ('protected-conflict', 'conflict-run', 'record', 'Ambiguous', '[]')",
    )
    .run();

  const result = pruneInactiveCatalogHistory(sqlite, 1);
  assert.equal(result.releasesDeleted, 1);
  assert.equal(result.sourceRunsDeleted, 1);
  assert.ok(result.factRowsDeleted >= 2);
  assert.deepEqual(
    sqlite
      .prepare("select version, status from source_runs order by version")
      .all(),
    [
      { version: "conflict", status: "staged" },
      { version: "v2", status: "staged" },
      { version: "v3", status: "active" },
    ],
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select version from source_runs where id in (?, ?) order by version",
      )
      .all(second.sourceRunId, third.sourceRunId),
    [{ version: "v2" }, { version: "v3" }],
  );
  assert.equal(
    (
      sqlite
        .prepare(
          "select source_run_id as sourceRunId from source_refreshes where id = 'refresh-v1'",
        )
        .get() as { sourceRunId: string | null }
    ).sourceRunId,
    null,
  );
  assert.equal(
    (
      sqlite.prepare("select count(*) as count from drops").get() as {
        count: number;
      }
    ).count,
    2,
  );
  assert.equal(pruneInactiveCatalogHistory(sqlite, 0).sourceRunsDeleted, 1);
  assert.deepEqual(
    sqlite.prepare("select version from source_runs order by version").all(),
    [{ version: "conflict" }, { version: "v3" }],
  );
  assert.throws(
    () => pruneInactiveCatalogHistory(sqlite, -1),
    /between 0 and 100000/,
  );
});

test("ambiguous aliases are recorded for review without corrupting relationships", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-promotion-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("v1", [
      entity("one", "First", "component"),
      entity("two", "Second", "component"),
    ]),
  );
  const seeded = sqlite
    .prepare("select id from entities order by name")
    .all() as Array<{ id: string }>;
  const insertAlias = sqlite.prepare(
    "insert into entity_aliases (entity_id, normalized, display) values (?, 'shared', 'Shared')",
  );
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
  assert.match(
    (
      sqlite
        .prepare(
          "select reason from ingestion_conflicts where source_run_id = ?",
        )
        .get(result.sourceRunId) as { reason: string }
    ).reason,
    /ambiguous/,
  );
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
  const before = sqlite.prepare("select id, kind from entities").get() as {
    id: string;
    kind: string;
  };
  const typed = {
    ...entity("mod-vitality", "Vitality", "mod", "v2", "typed"),
    evidence: evidence("v2", "typed"),
  } satisfies Observation;
  const result = promoteSource(sqlite, {
    ...input("v2", [typed]),
    source: { ...source, id: "typed", priority: 20 },
  });
  const after = sqlite.prepare("select id, kind from entities").get() as {
    id: string;
    kind: string;
  };

  assert.equal(result.conflictsCreated, 0);
  assert.deepEqual(after, { id: before.id, kind: "mod" });
});

test("a cited boss classification refines an enemy without later downgrade", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-boss-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(sqlite, input("v1", [entity("jackal", "Jackal", "enemy")]));
  const boss = {
    ...entity("jackal-boss", "Jackal", "boss", "v1", "wiki"),
    externalIds: [{ sourceId: "wiki", namespace: "name", value: "Jackal" }],
    evidence: evidence("v1", "wiki"),
  } satisfies Observation;
  const promoted = promoteSource(sqlite, {
    ...input("v1", [boss]),
    source: { ...source, id: "wiki", priority: 20 },
  });
  assert.equal(promoted.conflictsCreated, 0);
  assert.deepEqual(sqlite.prepare("select kind, slug from entities").get(), {
    kind: "boss",
    slug: "jackal",
  });

  promoteSource(
    sqlite,
    input("v2", [entity("jackal", "Jackal", "enemy", "v2")]),
  );
  assert.deepEqual(sqlite.prepare("select kind, slug from entities").get(), {
    kind: "boss",
    slug: "jackal",
  });
});

test("higher-priority cited facts remain field winners across provider refreshes", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-priority-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  promoteSource(
    sqlite,
    input("v1", [
      {
        ...entity("braton", "Braton", "weapon"),
        fields: {
          name: "Braton",
          slug: "braton",
          description: "Provider description",
        },
      },
    ]),
  );
  const correction: Observation = {
    type: "entity",
    kind: "weapon",
    externalIds: [{ sourceId: "fixture", namespace: "id", value: "braton" }],
    fields: { description: "Cited correction" },
    evidence: {
      ...evidence("manual-v1", "manual"),
      citationUrl: "https://example.test/correction",
    },
  };
  promoteSource(sqlite, {
    source: {
      id: "manual",
      name: "Manual",
      homepage: "https://example.test/correction",
      priority: 300,
    },
    version: "manual-v1",
    contentHash: "manual",
    retrievedAt: correction.evidence.retrievedAt,
    observations: [correction],
  });
  promoteSource(
    sqlite,
    input("v2", [
      {
        ...entity("braton", "Braton", "weapon", "v2"),
        fields: {
          name: "Braton",
          slug: "braton",
          description: "New provider description",
        },
      },
    ]),
  );
  assert.deepEqual(
    sqlite
      .prepare("select description from entities where slug = 'braton'")
      .get(),
    { description: "Cited correction" },
  );

  promoteSource(sqlite, {
    source: {
      id: "manual",
      name: "Manual",
      homepage: "https://example.test/correction",
      priority: 300,
    },
    version: "manual-v2",
    contentHash: "manual-v2",
    retrievedAt: "2026-01-03T00:00:00.000Z",
    observations: [
      {
        type: "entity",
        kind: "weapon",
        externalIds: [
          { sourceId: "fixture", namespace: "id", value: "braton" },
        ],
        fields: {},
        evidence: {
          ...evidence("manual-v2", "manual"),
          retrievedAt: "2026-01-03T00:00:00.000Z",
        },
      },
    ],
  });
  assert.deepEqual(
    sqlite
      .prepare("select description from entities where slug = 'braton'")
      .get(),
    { description: "New provider description" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        `select run.version, provenance.value_json as valueJson
         from fact_provenance provenance
         join source_runs run on run.id = provenance.source_run_id
         join entities entity on entity.id = provenance.entity_id
         where entity.slug = 'braton' and provenance.field = 'description' and run.status = 'active'`,
      )
      .all(),
    [{ version: "v2", valueJson: '"New provider description"' }],
  );

  promoteSource(
    sqlite,
    input("v3", [
      {
        ...entity("braton", "Braton", "weapon", "v3"),
        fields: { name: "Braton", slug: "braton" },
      },
    ]),
  );
  assert.deepEqual(
    sqlite
      .prepare("select description from entities where slug = 'braton'")
      .get(),
    { description: null },
  );
});

test("equal-priority field winners are stable across import order", async (context) => {
  const descriptions: string[] = [];
  for (const order of [
    ["zulu", "alpha"],
    ["alpha", "zulu"],
  ] as const) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-stable-tie-"));
    context.after(() => fs.rm(root, { recursive: true, force: true }));
    const databasePath = path.join(root, "catalog.sqlite");
    migrateDatabase(databasePath);
    const sqlite = new Database(databasePath);
    sqlite.pragma("foreign_keys = ON");
    context.after(() => sqlite.close());
    promoteSource(
      sqlite,
      input("base-v1", [entity("braton", "Braton", "weapon", "base-v1")]),
    );
    for (const sourceId of order) {
      const version = `${sourceId}-v1`;
      const observation: Observation = {
        type: "entity",
        kind: "weapon",
        externalIds: [
          { sourceId: "fixture", namespace: "id", value: "braton" },
        ],
        fields: {
          description:
            sourceId === "alpha" ? "Alpha description" : "Zulu description",
        },
        evidence: evidence(version, sourceId),
      };
      promoteSource(sqlite, {
        source: {
          id: sourceId,
          name: sourceId,
          homepage: `https://example.test/${sourceId}`,
          priority: 100,
        },
        version,
        contentHash: `sha256:${sourceId.padEnd(64, "0")}`,
        retrievedAt: observation.evidence.retrievedAt,
        observations: [observation],
      });
    }
    descriptions.push(
      (
        sqlite
          .prepare("select description from entities where slug = 'braton'")
          .get() as { description: string }
      ).description,
    );
  }
  assert.deepEqual(descriptions, ["Alpha description", "Alpha description"]);
});

test("equipment and mod fields are promoted as cited canonical fields", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-arcane-class-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  assert.throws(
    () =>
      promoteSource(
        sqlite,
        input("v0", [
          {
            ...entity("invalid-equipment", "Invalid Equipment", "mod", "v0"),
            fields: {
              name: "Invalid Equipment",
              slug: "invalid-equipment",
              equipmentMaxRank: 30,
            },
          },
        ]),
      ),
    /Equipment maximum rank requires equipment/,
  );
  assert.throws(
    () =>
      promoteSource(
        sqlite,
        input("v0-role", [
          {
            ...entity("invalid-role", "Invalid Role", "resource", "v0-role"),
            fields: {
              name: "Invalid Role",
              slug: "invalid-role",
              modularPartRole: "zaw-link",
            },
          },
        ]),
      ),
    /modular part role is invalid/,
  );
  const arcane = {
    ...entity("barrier", "Arcane Barrier", "arcane"),
    fields: {
      name: "Arcane Barrier",
      slug: "arcane-barrier",
      arcaneClass: "warframe" as const,
    },
  };
  const weapon = {
    ...entity("dread", "Dread", "weapon"),
    fields: {
      name: "Dread",
      slug: "dread",
      weaponClass: "zaw" as const,
      modularPartRole: "zaw-strike" as const,
      equipmentMaxRank: 30,
    },
  };
  const mod = {
    ...entity("serration", "Serration", "mod"),
    fields: {
      name: "Serration",
      slug: "serration",
      modMaxRank: 10,
      modBaseDrain: 4,
      modPolarity: "madurai" as const,
    },
  };

  promoteSource(sqlite, input("v1", [arcane, weapon, mod]));

  assert.deepEqual(
    sqlite
      .prepare(
        "select arcane_class as arcaneClass from entities where slug = 'arcane-barrier'",
      )
      .get(),
    { arcaneClass: "warframe" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select field, source_record_key as recordKey from fact_provenance where field = 'arcaneClass'",
      )
      .get(),
    { field: "arcaneClass", recordKey: "record" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select weapon_class as weaponClass, modular_part_role as modularPartRole, equipment_max_rank as equipmentMaxRank from entities where slug = 'dread'",
      )
      .get(),
    {
      weaponClass: "zaw",
      modularPartRole: "zaw-strike",
      equipmentMaxRank: 30,
    },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select field, source_record_key as recordKey from fact_provenance where field = 'weaponClass'",
      )
      .get(),
    { field: "weaponClass", recordKey: "record" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select field, value_json as valueJson from fact_provenance where entity_id = (select id from entities where slug = 'dread') and field = 'modularPartRole'",
      )
      .get(),
    { field: "modularPartRole", valueJson: '"zaw-strike"' },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select field, value_json as valueJson from fact_provenance where entity_id = (select id from entities where slug = 'dread') and field = 'equipmentMaxRank'",
      )
      .get(),
    { field: "equipmentMaxRank", valueJson: "30" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select mod_max_rank as modMaxRank, mod_base_drain as modBaseDrain, mod_polarity as modPolarity from entities where slug = 'serration'",
      )
      .get(),
    { modMaxRank: 10, modBaseDrain: 4, modPolarity: "madurai" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select field, value_json as valueJson from fact_provenance where entity_id = (select id from entities where slug = 'serration') and field like 'mod%' order by field",
      )
      .all(),
    [
      { field: "modBaseDrain", valueJson: "4" },
      { field: "modMaxRank", valueJson: "10" },
      { field: "modPolarity", valueJson: '"madurai"' },
    ],
  );
});

test("typed modular roles repair legacy non-representative weapons in place", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-modular-kind-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("v1", [
      {
        ...entity("peye", "Peye", "weapon", "v1"),
        fields: {
          name: "Peye",
          slug: "peye",
          weaponClass: "zaw",
        },
      },
    ]),
  );
  const originalId = (
    sqlite.prepare("select id from entities where slug = 'peye'").get() as {
      id: string;
    }
  ).id;

  promoteSource(
    sqlite,
    input("v2", [
      {
        ...entity("peye", "Peye", "component", "v2"),
        fields: {
          name: "Peye",
          slug: "peye",
          modularPartRole: "zaw-grip",
        },
      },
    ]),
  );

  assert.deepEqual(
    sqlite
      .prepare(
        "select id, kind, weapon_class as weaponClass, modular_part_role as modularPartRole from entities where slug = 'peye'",
      )
      .get(),
    {
      id: originalId,
      kind: "component",
      weaponClass: null,
      modularPartRole: "zaw-grip",
    },
  );
});

test("WFCD refresh repairs a legacy parent-qualified component in place", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-wfcd-kind-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    wfcdInput("v1", [
      wfcdEntity(
        "/Lotus/Types/Items/MiscItems/OrokinCell",
        "Zylok Prime Orokin Cell",
        "component",
        "v1",
      ),
    ]),
  );
  const originalId = (
    sqlite
      .prepare(
        "select entity_id as id from external_ids where source_id = 'wfcd-items' and value = ?",
      )
      .get("/Lotus/Types/Items/MiscItems/OrokinCell") as { id: string }
  ).id;

  const result = promoteSource(
    sqlite,
    wfcdInput("v2", [
      wfcdEntity(
        "/Lotus/Types/Items/MiscItems/OrokinCell",
        "Orokin Cell",
        "resource",
        "v2",
      ),
    ]),
  );

  assert.equal(result.conflictsCreated, 0);
  assert.deepEqual(
    sqlite
      .prepare("select id, kind, name, slug from entities where id = ?")
      .get(originalId),
    {
      id: originalId,
      kind: "resource",
      name: "Orokin Cell",
      slug: "orokin-cell",
    },
  );
});

test("WFCD identity repair merges a legacy component with an existing resource", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-wfcd-merge-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("resource-v1", [
      entity("drop-orokin-cell", "Orokin Cell", "resource", "resource-v1"),
    ]),
  );
  promoteSource(
    sqlite,
    wfcdInput("v1", [
      wfcdEntity(
        "/Lotus/Types/Items/MiscItems/OrokinCell",
        "Zylok Prime Orokin Cell",
        "component",
        "v1",
      ),
    ]),
  );
  const targetId = (
    sqlite
      .prepare("select id from entities where kind = 'resource' and slug = ?")
      .get("orokin-cell") as { id: string }
  ).id;
  const legacyId = (
    sqlite
      .prepare("select id from entities where kind = 'component' and slug = ?")
      .get("zylok-prime-orokin-cell") as { id: string }
  ).id;
  sqlite
    .prepare(
      "insert into users (id, username, email, email_verified, role, created_at, updated_at) values ('player', 'Player', 'player@example.test', 1, 'player', 1, 1)",
    )
    .run();
  sqlite
    .prepare(
      "insert into player_inventory (user_id, entity_id, owned_count, built_count, wanted_count, updated_at) values ('player', ?, 2, 0, 0, 1), ('player', ?, 5, 0, 0, 2)",
    )
    .run(targetId, legacyId);
  sqlite
    .prepare(
      "insert into player_goals (user_id, entity_id, target_quantity, created_at, updated_at) values ('player', ?, 1, 1, 1), ('player', ?, 3, 2, 2)",
    )
    .run(targetId, legacyId);

  const result = promoteSource(
    sqlite,
    wfcdInput("v2", [
      wfcdEntity(
        "/Lotus/Types/Items/MiscItems/OrokinCell",
        "Orokin Cell",
        "resource",
        "v2",
      ),
    ]),
  );

  assert.equal(result.conflictsCreated, 0);
  assert.deepEqual(
    sqlite
      .prepare(
        "select entity_id as entityId from external_ids where source_id = 'wfcd-items' and value = ?",
      )
      .get("/Lotus/Types/Items/MiscItems/OrokinCell"),
    { entityId: targetId },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select entity_id as entityId, owned_count as ownedCount from player_inventory where user_id = 'player'",
      )
      .all(),
    [{ entityId: targetId, ownedCount: 5 }],
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select entity_id as entityId, target_quantity as targetQuantity from player_goals where user_id = 'player'",
      )
      .all(),
    [{ entityId: targetId, targetQuantity: 3 }],
  );
  assert.deepEqual(
    sqlite.prepare("select retired from entities where id = ?").get(legacyId),
    { retired: 1 },
  );
});

test("WFCD identity repair splits incompatible provider IDs merged by a legacy alias", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-wfcd-split-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    wfcdInput("v1", [
      wfcdEntity("/enemy/kuva", "Kuva", "enemy", "v1"),
      wfcdEntity("/store/kuva", "Kuva", "enemy", "v1"),
    ]),
  );
  assert.equal(
    (
      sqlite
        .prepare(
          "select count(distinct entity_id) as count from external_ids where source_id = 'wfcd-items'",
        )
        .get() as { count: number }
    ).count,
    1,
  );

  const result = promoteSource(
    sqlite,
    wfcdInput("v2", [
      wfcdEntity("/enemy/kuva", "Kuva", "enemy", "v2"),
      wfcdEntity("/store/kuva", "Kuva", "resource", "v2"),
    ]),
  );

  assert.equal(result.conflictsCreated, 0);
  assert.deepEqual(
    sqlite
      .prepare(
        `select x.value, e.kind from external_ids x join entities e on e.id = x.entity_id
         where x.source_id = 'wfcd-items' order by x.value`,
      )
      .all(),
    [
      { value: "/enemy/kuva", kind: "enemy" },
      { value: "/store/kuva", kind: "resource" },
    ],
  );
});

test("WFCD identity repair does not reclassify a cross-source same-name entity", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-wfcd-cross-source-split-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());

  promoteSource(
    sqlite,
    input("fixture-v1", [entity("lizzie", "Lizzie", "weapon", "fixture-v1")]),
  );
  promoteSource(
    sqlite,
    wfcdInput("v1", [wfcdEntity("/skin/lizzie", "Lizzie", "unknown", "v1")]),
  );

  const result = promoteSource(
    sqlite,
    wfcdInput("v2", [wfcdEntity("/skin/lizzie", "Lizzie", "cosmetic", "v2")]),
  );

  assert.equal(result.conflictsCreated, 0);
  assert.deepEqual(
    sqlite
      .prepare(
        `select x.source_id as sourceId, e.kind from external_ids x
         join entities e on e.id = x.entity_id
         where x.value in ('lizzie', '/skin/lizzie') order by x.source_id`,
      )
      .all(),
    [
      { sourceId: "fixture", kind: "weapon" },
      { sourceId: "wfcd-items", kind: "cosmetic" },
    ],
  );
});

test("an overlay targeting an unimported provider becomes a reviewable conflict", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-missing-source-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const correction: Observation = {
    type: "entity",
    kind: "weapon",
    externalIds: [
      { sourceId: "not-imported", namespace: "id", value: "braton" },
    ],
    fields: { name: "Braton", slug: "braton", description: "Cited correction" },
    evidence: {
      ...evidence("manual-v1", "manual"),
      citationUrl: "https://example.test/correction",
    },
  };
  const result = promoteSource(sqlite, {
    source: {
      id: "manual",
      name: "Manual",
      homepage: "https://example.test/correction",
      priority: 300,
    },
    version: "manual-v1",
    contentHash: "manual",
    retrievedAt: correction.evidence.retrievedAt,
    observations: [correction],
  });

  assert.equal(result.conflictsCreated, 1);
  assert.equal(result.entitiesCreated, 0);
  assert.match(
    (
      sqlite
        .prepare(
          "select reason from ingestion_conflicts where source_run_id = ?",
        )
        .get(result.sourceRunId) as { reason: string }
    ).reason,
    /not registered: not-imported/,
  );
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

  const manualSource = {
    id: "manual-ranking",
    name: "Creator ranking",
    homepage: "https://example.test/video",
    license: "Citation only",
    priority: 200,
  };
  const manualEvidence = {
    sourceId: manualSource.id,
    sourceRecordKey: "ranking",
    snapshotVersion: "manual-v1",
    retrievedAt: "2026-10-13T12:00:00.000Z",
    citationUrl: manualSource.homepage,
  };
  const result = promoteSource(sqlite, {
    source: manualSource,
    version: "manual-v1",
    contentHash: "sha256:manual",
    retrievedAt: manualEvidence.retrievedAt,
    observations: [
      {
        type: "ranking-set",
        key: "primary-2026",
        title: "Primary ranking",
        author: "Creator",
        publishedAt: "2026-10-01",
        scope: "Primary weapons",
        scale: ["S", "A", "B"],
        licenseNote: "Citation only",
        evidence: manualEvidence,
      },
      {
        type: "ranking",
        setKey: "primary-2026",
        subjectExternalId: {
          sourceId: "fixture",
          namespace: "id",
          value: "braton",
        },
        tier: "A",
        timestampSeconds: 120,
        evidence: manualEvidence,
      },
    ],
  });

  assert.equal(result.rankingSetsCreated, 1);
  assert.equal(result.rankingsCreated, 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select rs.title, er.tier, e.name from editorial_rankings er join ranking_sets rs on rs.id = er.set_id join entities e on e.id = er.entity_id",
      )
      .get(),
    { title: "Primary ranking", tier: "A", name: "Braton" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        "select rs.source_record_key as setRecord, er.source_record_key as rankingRecord from editorial_rankings er join ranking_sets rs on rs.id = er.set_id",
      )
      .get(),
    { setRecord: "ranking", rankingRecord: "ranking" },
  );
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
    {
      type: "entity-relation",
      fromExternalId: { sourceId: "fixture", namespace: "id", value: "quest" },
      toExternalId: { sourceId: "fixture", namespace: "id", value: "node" },
      kind: "occurs-at",
      notes: "First step",
      evidence: {
        ...evidence(),
        sourceRecordKey: "quest:node",
        citationUrl: "https://example.test/relation",
      },
    },
  ] satisfies Observation[];
  const result = promoteSource(sqlite, input("v1", observations));

  assert.equal(result.relationsCreated, 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select kind, notes, source_record_key as recordKey, citation_url as citationUrl from entity_relations",
      )
      .get(),
    {
      kind: "occurs-at",
      notes: "First step",
      recordKey: "quest:node",
      citationUrl: "https://example.test/relation",
    },
  );
});

test("sourced enhancement options resolve canonical entities and rotate with source runs", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-enhancement-options-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const first = [
    entity("shard", "Crimson Archon Shard", "shard"),
    {
      type: "enhancement-option",
      subjectExternalId: {
        sourceId: "fixture",
        namespace: "id",
        value: "shard",
      },
      key: "ability-strength",
      label: "Ability Strength",
      evidence: {
        ...evidence(),
        sourceRecordKey: "shard:ability-strength",
        citationUrl: "https://example.test/shards",
      },
    },
  ] satisfies Observation[];
  assert.equal(
    promoteSource(sqlite, input("v1", first)).enhancementOptionsCreated,
    1,
  );
  const second = first.map((observation) => ({
    ...observation,
    evidence: { ...observation.evidence, snapshotVersion: "v2" },
  })) as Observation[];
  promoteSource(sqlite, input("v2", second));
  assert.deepEqual(
    sqlite
      .prepare(
        `
    select option.key, option.label, option.source_record_key as recordKey
    from entity_enhancement_options option join source_runs run on run.id = option.source_run_id
    where run.status = 'active'
  `,
      )
      .get(),
    {
      key: "ability-strength",
      label: "Ability Strength",
      recordKey: "shard:ability-strength",
    },
  );
});

test("equipment polarity sets preserve cited counts and asserted empty sets", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-equipment-polarities-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  context.after(() => sqlite.close());
  const subject = {
    sourceId: "fixture",
    namespace: "id",
    value: "weapon",
  };
  const first = [
    entity("weapon", "Braton", "weapon"),
    {
      type: "equipment-polarity-set",
      subjectExternalId: subject,
      configuration: "Primary",
      polarities: [
        { role: "normal", polarity: "madurai", quantity: 2 },
        { role: "exilus", polarity: "naramon", quantity: 1 },
      ],
      evidence: {
        ...evidence(),
        sourceRecordKey: "weapon:factory-polarities",
        citationUrl: "https://example.test/braton",
      },
    },
  ] satisfies Observation[];
  assert.equal(
    promoteSource(sqlite, input("v1", first)).equipmentPolaritySetsCreated,
    1,
  );
  assert.deepEqual(
    sqlite
      .prepare(
        `select polarity.configuration, polarity.polarities_json as polaritiesJson,
                polarity.citation_url as citationUrl
         from equipment_polarity_sets polarity
         join source_runs run on run.id = polarity.source_run_id
         where run.status = 'active'`,
      )
      .get(),
    {
      configuration: "Primary",
      polaritiesJson: JSON.stringify(first[1].polarities),
      citationUrl: "https://example.test/braton",
    },
  );

  const second = first.map((observation) => ({
    ...observation,
    ...(observation.type === "equipment-polarity-set"
      ? { polarities: [] }
      : {}),
    evidence: { ...observation.evidence, snapshotVersion: "v2" },
  })) as Observation[];
  promoteSource(sqlite, input("v2", second));
  assert.equal(
    (
      sqlite
        .prepare(
          `select polarity.polarities_json as polaritiesJson
           from equipment_polarity_sets polarity
           join source_runs run on run.id = polarity.source_run_id
           where run.status = 'active'`,
        )
        .get() as { polaritiesJson: string }
    ).polaritiesJson,
    "[]",
  );
});

function input(version: string, observations: Observation[]) {
  return {
    source,
    version,
    contentHash: `sha256:${version.padEnd(64, "0")}`,
    retrievedAt: "2026-10-13T12:00:00.000Z",
    observations,
  };
}

function wfcdInput(version: string, observations: Observation[]) {
  return {
    source: {
      id: "wfcd-items",
      name: "WFCD items fixture",
      homepage: "https://example.test/wfcd",
      license: "MIT",
      priority: 100,
    },
    version,
    contentHash: `sha256:${`wfcd-${version}`.padEnd(64, "0")}`,
    retrievedAt: "2026-10-13T12:00:00.000Z",
    observations,
  };
}

function wfcdEntity(
  id: string,
  name: string,
  kind: "component" | "cosmetic" | "enemy" | "resource" | "unknown",
  version: string,
): Observation {
  return {
    type: "entity",
    kind,
    externalIds: [
      { sourceId: "wfcd-items", namespace: "uniqueName", value: id },
    ],
    fields: { name, slug: name.toLowerCase().replaceAll(" ", "-") },
    evidence: {
      ...evidence(version, "wfcd-items"),
      sourceRecordKey: id,
    },
  };
}

function evidence(version = "v1", sourceId = "fixture") {
  return {
    sourceId,
    sourceRecordKey: "record",
    snapshotVersion: version,
    retrievedAt: "2026-10-13T12:00:00.000Z",
  };
}

function entity(
  id: string,
  name: string,
  kind:
    | "unknown"
    | "component"
    | "cosmetic"
    | "enemy"
    | "mod"
    | "node"
    | "resource"
    | "weapon"
    | "quest"
    | "shard",
  version = "v1",
  sourceId = "fixture",
): Observation {
  return {
    type: "entity",
    kind,
    externalIds: [{ sourceId, namespace: "id", value: id }],
    fields: { name, slug: name.toLowerCase().replaceAll(" ", "-") },
    evidence: evidence(version, sourceId),
  };
}

function drop(version: string, chance: number): Observation {
  return {
    type: "drop",
    rewardExternalId: { sourceId: "fixture", namespace: "id", value: "reward" },
    nodeExternalId: { sourceId: "fixture", namespace: "id", value: "node" },
    locationLabel: "Falling Glory, Venus",
    chance,
    evidence: evidence(version),
  };
}
