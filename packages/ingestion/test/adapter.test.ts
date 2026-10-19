import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  DEFAULT_WFCD_ITEMS_URL,
  WfcdDropsAdapter,
  WfcdItemsAdapter,
  type Snapshot,
} from "../src/index.ts";

const snapshot: Snapshot = {
  sourceId: "wfcd-items",
  version: "fixture-1",
  retrievedAt: "2026-01-01T00:00:00Z",
  contentHash: "fixture",
  mediaType: "application/json",
  bytes: new TextEncoder().encode(
    JSON.stringify([
      {
        uniqueName: "/Lotus/Powersuits/Ash/Ash",
        name: "Ash",
        description: "Smoke and blades.",
        category: "Warframes",
      },
      { uniqueName: "/ignored", name: "Ignored", category: "Unknown" },
    ]),
  ),
};

test("WFCD adapter emits source-neutral, evidenced observations", async () => {
  const observations = await collect(new WfcdItemsAdapter(), snapshot);
  assert.equal(observations.length, 2);
  assert.equal(observations[0]?.type, "entity");
  assert.equal(
    observations[0]?.evidence.sourceRecordKey,
    "/Lotus/Powersuits/Ash/Ash",
  );
  assert.equal(
    observations[1]?.type === "entity" && observations[1].kind,
    "unknown",
  );
});

test("WFCD adapter retains sane canonical mod capacity facts", async () => {
  const modSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/mod",
          name: "Capacity Test",
          category: "Mods",
          fusionLimit: 5,
          baseDrain: 4,
          polarity: "madurai",
        },
        {
          uniqueName: "/riven-placeholder",
          name: "Riven Placeholder",
          category: "Mods",
          fusionLimit: 592,
          baseDrain: -1812070400,
          polarity: "unknown-provider-value",
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), modSnapshot);
  assert.deepEqual(
    observations.flatMap((entry) =>
      entry.type === "entity"
        ? [
            {
              name: entry.fields.name,
              maxRank: entry.fields.modMaxRank,
              baseDrain: entry.fields.modBaseDrain,
              polarity: entry.fields.modPolarity,
            },
          ]
        : [],
    ),
    [
      {
        name: "Capacity Test",
        maxRank: 5,
        baseDrain: 4,
        polarity: "madurai",
      },
      {
        name: "Riven Placeholder",
        maxRank: undefined,
        baseDrain: undefined,
        polarity: undefined,
      },
    ],
  );
});

test("WFCD component references retain trustworthy item kinds and qualified part names", async () => {
  const componentSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/alloy",
          name: "Adramal Alloy",
          category: "Resources",
          components: [
            {
              uniqueName: "/ore",
              name: "Adramalium",
              category: "Resources",
              itemCount: 20,
            },
            {
              uniqueName: "/blueprint",
              name: "Blueprint",
              category: "Components",
              itemCount: 1,
            },
          ],
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), componentSnapshot);
  const entities = observations.filter((entry) => entry.type === "entity");
  assert.deepEqual(
    entities.map((entry) => [entry.kind, entry.fields.name]),
    [
      ["resource", "Adramal Alloy"],
      ["resource", "Adramalium"],
      ["component", "Adramal Alloy Blueprint"],
    ],
  );
});

test("WFCD shared recipe materials retain one intrinsic identity", async () => {
  const sharedSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/weapon-a",
          name: "Weapon A",
          category: "Primary",
          components: [
            {
              uniqueName: "/forma",
              name: "Forma",
              category: "Misc",
              itemCount: 1,
            },
          ],
        },
        {
          uniqueName: "/weapon-b",
          name: "Weapon B",
          category: "Primary",
          components: [
            {
              uniqueName: "/forma",
              name: "Forma",
              category: "Misc",
              itemCount: 2,
            },
          ],
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), sharedSnapshot);
  assert.deepEqual(
    observations.flatMap((entry) =>
      entry.type === "entity" && entry.externalIds[0]?.value === "/forma"
        ? [[entry.kind, entry.fields.name, entry.fields.slug]]
        : [],
    ),
    [
      ["resource", "Forma", "forma"],
      ["resource", "Forma", "forma"],
    ],
  );
});

test("WFCD same-kind display collisions receive stable provider-derived qualifiers", async () => {
  const collisionSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/trophy",
          name: "The Steel Path - 1999",
          category: "Skins",
          type: "Ship Decoration",
        },
        {
          uniqueName: "/emote",
          name: "The Steel Path: 1999",
          category: "Skins",
          type: "Emotes",
        },
        {
          uniqueName: "/forma",
          name: "Forma",
          category: "Misc",
          type: "Equipment Adapter",
        },
        {
          uniqueName: "/store-forma",
          name: "Forma",
          category: "Misc",
          type: "Equipment Adapter",
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), collisionSnapshot);
  assert.deepEqual(
    observations
      .filter((entry) => entry.type === "entity")
      .map((entry) => [entry.kind, entry.fields.name, entry.fields.slug]),
    [
      [
        "unknown",
        "The Steel Path - 1999 (Ship Decoration)",
        "the-steel-path-1999-ship-decoration",
      ],
      [
        "unknown",
        "The Steel Path: 1999 (Emotes)",
        "the-steel-path-1999-emotes",
      ],
      ["resource", "Forma", "forma"],
      ["resource", "Forma", "forma"],
    ],
  );
});

test("WFCD adapter distinguishes arcanes and provider-miscategorised Archon Shards", async () => {
  const specialItemSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName:
            "/Lotus/Upgrades/CosmeticEnhancers/Defensive/GolemArcaneBarrier",
          name: "Arcane Barrier",
          category: "Arcanes",
          type: "Warframe Arcane",
        },
        {
          uniqueName:
            "/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalAmarMythic",
          name: "<Shard_red_simple> Tauforged Crimson Archon Shard",
          category: "Misc",
          type: "Misc",
        },
      ]),
    ),
  };
  const observations = await collect(
    new WfcdItemsAdapter(),
    specialItemSnapshot,
  );
  assert.deepEqual(
    observations
      .filter((entry) => entry.type === "entity")
      .map((entry) => [entry.kind, entry.fields.name]),
    [
      ["arcane", "Arcane Barrier"],
      ["shard", "Tauforged Crimson Archon Shard"],
    ],
  );
  assert.equal(
    observations[0]?.type === "entity" && observations[0].fields.arcaneClass,
    "warframe",
  );
});

test("WFCD adapter maps arcane classes into source-neutral compatibility facts", async () => {
  const arcaneSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/warframe",
          name: "Arcane Barrier",
          category: "Arcanes",
          type: "Warframe Arcane",
        },
        {
          uniqueName: "/operator",
          name: "Magus Elevate",
          category: "Arcanes",
          type: "Operator Arcane",
        },
        {
          uniqueName: "/amp",
          name: "Virtuos Strike",
          category: "Arcanes",
          type: "Amp Arcane",
        },
        {
          uniqueName: "/primary",
          name: "Primary Merciless",
          category: "Arcanes",
          type: "Primary Arcane",
        },
        {
          uniqueName: "/kitgun",
          name: "Pax Charge",
          category: "Arcanes",
          type: "Kitgun Arcane",
        },
        {
          uniqueName: "/zaw",
          name: "Exodia Contagion",
          category: "Arcanes",
          type: "Zaw Arcane",
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), arcaneSnapshot);
  assert.deepEqual(
    observations
      .filter((entry) => entry.type === "entity")
      .map((entry) => entry.fields.arcaneClass),
    ["warframe", "operator", "amp", "primary", "kitgun", "zaw"],
  );
});

test("WFCD adapter maps equipment classes and modular weapon representatives", async () => {
  const weaponSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/rifle",
          name: "Braton",
          category: "Primary",
          type: "Rifle",
          productCategory: "LongGuns",
        },
        {
          uniqueName: "/bow",
          name: "Dread",
          category: "Primary",
          type: "Bow",
          productCategory: "LongGuns",
        },
        {
          uniqueName: "/shotgun",
          name: "Boar",
          category: "Primary",
          type: "Shotgun",
          productCategory: "LongGuns",
        },
        {
          uniqueName: "/pistol",
          name: "Lex",
          category: "Secondary",
          type: "Pistol",
          productCategory: "Pistols",
        },
        {
          uniqueName: "/amp",
          name: "Sirocco",
          category: "Primary",
          type: "Pistol",
          productCategory: "OperatorAmps",
        },
        {
          uniqueName:
            "/Lotus/Weapons/SolarisUnited/Secondary/Set/Barrel/Catchmoon",
          name: "Catchmoon",
          category: "Misc",
          type: "Kitgun Component",
        },
        {
          uniqueName:
            "/Lotus/Weapons/SolarisUnited/Secondary/Set/Handle/Haymaker",
          name: "Haymaker",
          category: "Misc",
          type: "Kitgun Component",
        },
        {
          uniqueName: "/Lotus/Weapons/Ostron/Melee/Set/Tips/Balla",
          name: "Balla",
          category: "Melee",
          type: "Zaw Component",
        },
        {
          uniqueName: "/Lotus/Weapons/Ostron/Melee/Set/Handle/Peye",
          name: "Peye",
          category: "Melee",
          type: "Zaw Component",
        },
        {
          uniqueName: "/archwing",
          name: "Odonata",
          category: "Archwing",
          type: "Archwing",
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), weaponSnapshot);
  assert.deepEqual(
    observations
      .filter((entry) => entry.type === "entity")
      .map((entry) => [
        entry.fields.name,
        entry.kind,
        entry.fields.weaponClass,
      ]),
    [
      ["Braton", "weapon", "primary"],
      ["Dread", "weapon", "bow"],
      ["Boar", "weapon", "shotgun"],
      ["Lex", "weapon", "secondary"],
      ["Sirocco", "weapon", "amp"],
      ["Catchmoon", "weapon", "kitgun"],
      ["Haymaker", "component", undefined],
      ["Balla", "weapon", "zaw"],
      ["Peye", "component", undefined],
      ["Odonata", "archwing", undefined],
    ],
  );
});

test("WFCD node records retain planet and level metadata", async () => {
  const nodeSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "SolNode22",
          name: "Tessera",
          category: "Node",
          systemName: "Venus",
          minEnemyLevel: 3,
          maxEnemyLevel: 5,
          masteryReq: 0,
          nodeType: 0,
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), nodeSnapshot);
  assert.deepEqual(
    observations.find((entry) => entry.type === "node-detail"),
    {
      type: "node-detail",
      nodeExternalId: {
        sourceId: "wfcd-items",
        namespace: "uniqueName",
        value: "SolNode22",
      },
      planet: "Venus",
      minimumEnemyLevel: 3,
      maximumEnemyLevel: 5,
      masteryRequirement: 0,
      nodeType: 0,
      evidence: {
        sourceId: "wfcd-items",
        sourceRecordKey: "SolNode22",
        snapshotVersion: "fixture-1",
        retrievedAt: "2026-01-01T00:00:00Z",
        citationUrl: undefined,
        license: "MIT",
        path: "[0]",
      },
    },
  );
});

test("empty snapshots fail closed", async () => {
  await assert.rejects(
    () =>
      collect(new WfcdItemsAdapter(), {
        ...snapshot,
        bytes: new TextEncoder().encode("[]"),
      }),
    /produced no observations/,
  );
});

test("WFCD adapter defaults to the maintained aggregate endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response("[]", {
      headers: { etag: "fixture-etag", "content-type": "application/json" },
    });
  };
  try {
    const adapter = new WfcdItemsAdapter();
    const fetched = await adapter.fetch({});
    assert.equal(requestedUrl, DEFAULT_WFCD_ITEMS_URL);
    assert.equal(fetched.version, "fixture-etag|wfcd-items-v8");
    assert.equal(adapter.minimumRetainedObservationRatio, 0.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("drop adapter joins node and reward through stable provider IDs", async () => {
  const drops = new WfcdDropsAdapter();
  assert.equal(drops.minimumRetainedObservationRatio, 0.5);
  const observations = await collect(drops, {
    ...snapshot,
    sourceId: "wfcd-drops",
    bytes: new TextEncoder().encode(
      JSON.stringify({
        missionRewards: {
          Venus: {
            Tessera: {
              gameMode: "Defense",
              rewards: {
                A: [
                  { _id: "reward-1", itemName: "Lith A1 Relic", chance: 14.29 },
                ],
              },
            },
          },
        },
      }),
    ),
  });
  assert.equal(
    observations.filter((entry) => entry.type === "entity").length,
    2,
  );
  const drop = observations.find((entry) => entry.type === "drop");
  const reward = observations.find(
    (entry) => entry.type === "entity" && entry.kind === "unknown",
  );
  const nodeDetail = observations.find((entry) => entry.type === "node-detail");
  assert.equal(reward?.type, "entity");
  if (reward?.type === "entity")
    assert.equal(reward.fields.name, "Lith A1 Relic");
  assert.equal(drop?.chance, 0.1429);
  assert.equal(drop?.locationLabel, "Tessera, Venus");
  assert.equal(
    nodeDetail?.type === "node-detail" && nodeDetail.missionType,
    "Defense",
  );
});

test("drop adapter supports missions without named rotations", async () => {
  const observations = await collect(new WfcdDropsAdapter(), {
    ...snapshot,
    sourceId: "wfcd-drops",
    bytes: new TextEncoder().encode(
      JSON.stringify({
        missionRewards: {
          Mercury: {
            Elion: {
              gameMode: "Capture",
              rewards: [
                { _id: "reward-2", itemName: "Vitality", chance: 10.84 },
              ],
            },
          },
        },
      }),
    ),
  });
  const drop = observations.find((entry) => entry.type === "drop");
  assert.equal(drop?.rotation, undefined);
  assert.equal(drop?.chance, 0.1084);
});
