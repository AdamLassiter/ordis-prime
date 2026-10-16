import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addBuildAcquisitionGoals,
  calculateRankedModDrain,
  clonePlayerBuild,
  cloneSharedBuild,
  configureBuildEquipment,
  createBuildShare,
  createLocalUser,
  createPlayerBuild,
  findSharedBuild,
  getPlayerBuild,
  listBuildShares,
  listPlayerGoals,
  migrateDatabase,
  openSqliteDatabase,
  revokeBuildShare,
  searchBuildCandidates,
  searchBuildEnhancementCandidates,
  setBuildEnhancement,
  setBuildEquipment,
  setBuildMod,
  setInventoryEntry,
  setPlayerGoal,
  updatePlayerBuild,
} from "../src/index.ts";

test("ranked mod drain preserves aura and stance capacity bonuses", () => {
  assert.equal(calculateRankedModDrain(4, 5), 9);
  assert.equal(calculateRankedModDrain(-2, 5), -7);
  assert.equal(calculateRankedModDrain(undefined, 5), undefined);
  assert.equal(calculateRankedModDrain(4, undefined), undefined);
});

test("build drafts are private and share snapshots remain immutable", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-builds-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "builds.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const owner = createLocalUser(database, { username: "Builder" });
  const other = createLocalUser(database, { username: "Other" });
  seedEntity(database, "frame", "warframe", "Mag", "mag");
  seedEntity(
    database,
    "weapon",
    "weapon",
    "Paris",
    "paris",
    undefined,
    "primary",
  );
  seedEntity(database, "bow", "weapon", "Dread", "dread", undefined, "bow");
  seedEntity(
    database,
    "secondary",
    "weapon",
    "Lex",
    "lex",
    undefined,
    "secondary",
  );
  seedEntity(database, "mod", "mod", "Serration", "serration");
  database
    .prepare(
      "update entities set mod_max_rank = 10, mod_base_drain = 4, mod_polarity = 'madurai' where id = 'mod'",
    )
    .run();
  seedEntity(
    database,
    "arcane",
    "arcane",
    "Arcane Barrier",
    "arcane-barrier",
    "warframe",
  );
  seedEntity(
    database,
    "operator-arcane",
    "arcane",
    "Magus Elevate",
    "magus-elevate",
    "operator",
  );
  seedEntity(
    database,
    "bow-arcane",
    "arcane",
    "Longbow Sharpshot",
    "longbow-sharpshot",
    "bow",
  );
  seedEntity(
    database,
    "shard",
    "shard",
    "Crimson Archon Shard",
    "crimson-archon-shard",
  );
  seedEnhancementOption(
    database,
    "shard",
    "ability-strength",
    "Ability Strength",
  );
  assert.deepEqual(searchBuildCandidates(database, "primary", "Par"), [
    { kind: "weapon", slug: "paris", name: "Paris", weaponClass: "primary" },
  ]);
  assert.deepEqual(searchBuildCandidates(database, "secondary", "Par"), []);
  assert.deepEqual(searchBuildCandidates(database, "mod", "Serr"), [
    {
      kind: "mod",
      slug: "serration",
      name: "Serration",
      modMaxRank: 10,
      modBaseDrain: 4,
      modPolarity: "madurai",
    },
  ]);
  assert.deepEqual(
    searchBuildEnhancementCandidates(database, "warframe-arcane-1", "Barrier"),
    [
      {
        kind: "arcane",
        slug: "arcane-barrier",
        name: "Arcane Barrier",
        arcaneClass: "warframe",
      },
    ],
  );
  assert.deepEqual(
    searchBuildEnhancementCandidates(database, "warframe-arcane-1", "Elevate"),
    [],
  );
  assert.deepEqual(
    searchBuildEnhancementCandidates(database, "operator-arcane-1", "Elevate"),
    [
      {
        kind: "arcane",
        slug: "magus-elevate",
        name: "Magus Elevate",
        arcaneClass: "operator",
      },
    ],
  );
  assert.deepEqual(
    searchBuildEnhancementCandidates(database, "archon-shard-1", "Crimson"),
    [
      {
        kind: "shard",
        slug: "crimson-archon-shard",
        name: "Crimson Archon Shard",
        enhancementOptions: [
          {
            key: "ability-strength",
            label: "Ability Strength",
            sourceName: "Shard facts",
            citationUrl: "https://example.test/shards",
          },
        ],
      },
    ],
  );
  const buildId = createPlayerBuild(database, owner, {
    title: "Starter setup",
    category: "beginner",
  });
  setBuildEquipment(database, owner, buildId, "warframe", {
    kind: "warframe",
    slug: "mag",
  });
  setBuildEquipment(database, owner, buildId, "primary", {
    kind: "weapon",
    slug: "paris",
  });
  configureBuildEquipment(database, owner, buildId, "primary", {
    configuration: "Incarnon",
    formaCount: 3,
    capacityUpgrade: true,
  });
  setBuildMod(
    database,
    owner,
    buildId,
    "primary",
    0,
    { kind: "mod", slug: "serration" },
    5,
  );
  assert.throws(
    () =>
      setBuildMod(
        database,
        owner,
        buildId,
        "primary",
        1,
        { kind: "mod", slug: "serration" },
        11,
      ),
    /rank must not exceed 10/,
  );
  setBuildEnhancement(
    database,
    owner,
    buildId,
    "warframe-arcane-1",
    { kind: "arcane", slug: "arcane-barrier" },
    5,
  );
  assert.deepEqual(
    searchBuildEnhancementCandidates(
      database,
      "primary-arcane",
      "Longbow",
      buildId,
    ),
    [],
  );
  setBuildEnhancement(
    database,
    owner,
    buildId,
    "archon-shard-1",
    { kind: "shard", slug: "crimson-archon-shard" },
    undefined,
    "ability-strength",
  );
  setBuildEnhancement(
    database,
    owner,
    buildId,
    "archon-shard-2",
    { kind: "shard", slug: "crimson-archon-shard" },
    undefined,
    "ability-strength",
  );
  assert.equal(getPlayerBuild(database, other, buildId), undefined);
  assert.equal(
    getPlayerBuild(database, owner, buildId)?.equipment.find(
      ({ slot }) => slot === "primary",
    )?.mods[0]?.entity.name,
    "Serration",
  );
  assert.deepEqual(
    getPlayerBuild(database, owner, buildId)?.equipment.find(
      ({ slot }) => slot === "primary",
    ),
    {
      id: getPlayerBuild(database, owner, buildId)?.equipment.find(
        ({ slot }) => slot === "primary",
      )?.id,
      slot: "primary",
      entity: { kind: "weapon", slug: "paris", name: "Paris" },
      configuration: "Incarnon",
      formaCount: 3,
      capacityUpgrade: true,
      notes: undefined,
      mods: [
        {
          position: 0,
          rank: 5,
          maxRank: 10,
          baseDrain: 4,
          polarity: "madurai",
          drain: 9,
          entity: { kind: "mod", slug: "serration", name: "Serration" },
        },
      ],
    },
  );
  setPlayerGoal(database, owner, { kind: "mod", slug: "serration" }, 3);
  assert.equal(addBuildAcquisitionGoals(database, owner, buildId), 4);
  assert.deepEqual(
    listPlayerGoals(database, owner).map(({ name, targetQuantity }) => ({
      name,
      targetQuantity,
    })),
    [
      { name: "Arcane Barrier", targetQuantity: 1 },
      { name: "Crimson Archon Shard", targetQuantity: 2 },
      { name: "Mag", targetQuantity: 1 },
      { name: "Paris", targetQuantity: 1 },
      { name: "Serration", targetQuantity: 3 },
    ],
  );
  setInventoryEntry(database, owner, "weapon", {
    ownedCount: 0,
    builtCount: 1,
    wantedCount: 0,
  });
  assert.equal(addBuildAcquisitionGoals(database, owner, buildId), 0);

  const shareKey = createBuildShare(database, owner, buildId);
  const shared = findSharedBuild(database, shareKey)!;
  updatePlayerBuild(database, owner, buildId, { title: "Changed setup" });
  assert.equal(shared.title, "Starter setup");
  assert.equal(
    shared.equipment.find(({ slot }) => slot === "primary")?.configuration,
    "Incarnon",
  );
  assert.deepEqual(shared.enhancements, [
    {
      slot: "archon-shard-1",
      entity: {
        kind: "shard",
        slug: "crimson-archon-shard",
        name: "Crimson Archon Shard",
      },
      option: {
        key: "ability-strength",
        label: "Ability Strength",
        available: true,
      },
    },
    {
      slot: "archon-shard-2",
      entity: {
        kind: "shard",
        slug: "crimson-archon-shard",
        name: "Crimson Archon Shard",
      },
      option: {
        key: "ability-strength",
        label: "Ability Strength",
        available: true,
      },
    },
    {
      slot: "warframe-arcane-1",
      entity: {
        kind: "arcane",
        slug: "arcane-barrier",
        name: "Arcane Barrier",
      },
      rank: 5,
    },
  ]);
  assert.deepEqual(
    listBuildShares(database, owner, buildId).map(
      ({ shareKey: _shareKey, ...entry }) => entry,
    ),
    [{ revision: shared.revision, createdAt: shared.sharedAt }],
  );
  const publicCloneId = cloneSharedBuild(database, other, shareKey);
  const publicClone = getPlayerBuild(database, other, publicCloneId)!;
  assert.equal(publicClone.title, "Starter setup (copy)");
  assert.equal(
    publicClone.equipment.find(({ slot }) => slot === "primary")?.configuration,
    "Incarnon",
  );
  assert.equal(
    publicClone.equipment.find(({ slot }) => slot === "primary")?.mods[0]?.rank,
    5,
  );
  assert.equal(
    publicClone.enhancements.find(({ slot }) => slot === "warframe-arcane-1")
      ?.rank,
    5,
  );
  assert.equal(getPlayerBuild(database, owner, publicCloneId), undefined);
  const buildCountBeforeFailedClone = (
    database.prepare("select count(*) as count from player_builds").get() as {
      count: number;
    }
  ).count;
  database.prepare("update entities set retired = 1 where id = 'mod'").run();
  assert.throws(
    () => cloneSharedBuild(database, other, shareKey),
    /Unknown active entity mod:serration/,
  );
  assert.equal(
    (
      database.prepare("select count(*) as count from player_builds").get() as {
        count: number;
      }
    ).count,
    buildCountBeforeFailedClone,
  );
  database.prepare("update entities set retired = 0 where id = 'mod'").run();
  const cloneId = clonePlayerBuild(database, owner, buildId);
  const clone = getPlayerBuild(database, owner, cloneId)!;
  assert.equal(clone.title, "Changed setup (copy)");
  assert.equal(
    clone.equipment.find(({ slot }) => slot === "primary")?.mods[0]?.entity
      .name,
    "Serration",
  );
  assert.equal(
    clone.equipment.find(({ slot }) => slot === "primary")?.configuration,
    "Incarnon",
  );
  assert.equal(clone.enhancements.length, 3);
  revokeBuildShare(database, owner, buildId, shareKey);
  assert.equal(findSharedBuild(database, shareKey), undefined);
  assert.throws(
    () => revokeBuildShare(database, other, buildId, shareKey),
    /not found/,
  );
  assert.notEqual(
    getPlayerBuild(database, owner, buildId)?.revision,
    shared.revision,
  );
  assert.throws(
    () =>
      setBuildEquipment(database, other, buildId, "primary", {
        kind: "weapon",
        slug: "paris",
      }),
    /not found/,
  );
  assert.throws(
    () =>
      setBuildEnhancement(database, owner, buildId, "archon-shard-3", {
        kind: "arcane",
        slug: "arcane-barrier",
      }),
    /requires a shard/,
  );
  assert.throws(
    () =>
      setBuildEnhancement(database, owner, buildId, "warframe-arcane-2", {
        kind: "arcane",
        slug: "magus-elevate",
      }),
    /not compatible/,
  );
  assert.throws(
    () =>
      setBuildEnhancement(database, owner, buildId, "primary-arcane", {
        kind: "arcane",
        slug: "longbow-sharpshot",
      }),
    /not compatible/,
  );
  assert.throws(
    () =>
      setBuildEquipment(database, owner, buildId, "primary", {
        kind: "weapon",
        slug: "lex",
      }),
    /not compatible/,
  );
  assert.throws(
    () =>
      setBuildEnhancement(database, owner, buildId, "archon-shard-3", {
        kind: "shard",
        slug: "crimson-archon-shard",
      }),
    /require a sourced effect/,
  );
  assert.throws(
    () =>
      setBuildEnhancement(
        database,
        owner,
        buildId,
        "archon-shard-3",
        { kind: "shard", slug: "crimson-archon-shard" },
        undefined,
        "missing",
      ),
    /not active/,
  );
  assert.throws(
    () => cloneSharedBuild(database, other, "missing-share"),
    /not found/,
  );
});

test("specialized weapon arcanes remain valid regardless of assignment order", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-specialized-arcane-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "builds.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const owner = createLocalUser(database, { username: "Builder" });
  seedEntity(
    database,
    "rifle",
    "weapon",
    "Braton",
    "braton",
    undefined,
    "primary",
  );
  seedEntity(database, "bow", "weapon", "Dread", "dread", undefined, "bow");
  seedEntity(
    database,
    "bow-arcane",
    "arcane",
    "Longbow Sharpshot",
    "longbow-sharpshot",
    "bow",
  );
  const buildId = createPlayerBuild(database, owner, { title: "Bow setup" });

  setBuildEnhancement(database, owner, buildId, "primary-arcane", {
    kind: "arcane",
    slug: "longbow-sharpshot",
  });
  assert.throws(
    () =>
      setBuildEquipment(database, owner, buildId, "primary", {
        kind: "weapon",
        slug: "braton",
      }),
    /not compatible with Braton/,
  );
  setBuildEquipment(database, owner, buildId, "primary", {
    kind: "weapon",
    slug: "dread",
  });
  assert.equal(
    getPlayerBuild(database, owner, buildId)?.equipment[0]?.entity.name,
    "Dread",
  );
});

test("cloned build titles stay within the draft title limit", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-build-title-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "builds.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const owner = createLocalUser(database, { username: "Builder" });
  const buildId = createPlayerBuild(database, owner, {
    title: "x".repeat(160),
  });
  const clone = getPlayerBuild(
    database,
    owner,
    clonePlayerBuild(database, owner, buildId),
  )!;
  assert.equal(clone.title.length, 160);
  assert.match(clone.title, / \(copy\)$/);
});

function seedEntity(
  database: ReturnType<typeof openSqliteDatabase>,
  id: string,
  kind: string,
  name: string,
  slug: string,
  arcaneClass?: string,
  weaponClass?: string,
) {
  database
    .prepare(
      "insert into entities (id, kind, name, slug, arcane_class, weapon_class, retired, updated_at) values (?, ?, ?, ?, ?, ?, 0, ?)",
    )
    .run(
      id,
      kind,
      name,
      slug,
      arcaneClass ?? null,
      weaponClass ?? null,
      Date.now(),
    );
}

function seedEnhancementOption(
  database: ReturnType<typeof openSqliteDatabase>,
  entityId: string,
  key: string,
  label: string,
) {
  database
    .prepare(
      "insert into sources (id, name, homepage, priority, enabled) values ('shard-facts', 'Shard facts', 'https://example.test/shards', 100, 1)",
    )
    .run();
  database
    .prepare(
      "insert into source_runs (id, source_id, version, content_hash, retrieved_at, status) values ('shard-run', 'shard-facts', 'v1', 'hash', ?, 'active')",
    )
    .run(Date.now());
  database
    .prepare(
      "insert into entity_enhancement_options (id, entity_id, key, label, source_run_id, source_record_key, citation_url) values ('option', ?, ?, ?, 'shard-run', 'record', 'https://example.test/shards')",
    )
    .run(entityId, key, label);
}
