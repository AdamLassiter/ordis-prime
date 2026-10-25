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

test("WFCD adapter retains only disclosed companion factory polarities", async () => {
  const companionSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/carrier-prime",
          name: "Carrier Prime",
          category: "Sentinels",
          polarities: ["penjaga", "madurai", "penjaga"],
        },
        {
          uniqueName: "/hound",
          name: "Dorma Hound",
          category: "Pets",
        },
        {
          uniqueName: "/braton",
          name: "Braton",
          category: "Primary",
          polarities: ["madurai"],
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), companionSnapshot);
  assert.deepEqual(
    observations.flatMap((entry) =>
      entry.type === "equipment-polarity-set"
        ? [
            {
              subject: entry.subjectExternalId.value,
              polarities: entry.polarities,
              record: entry.evidence.sourceRecordKey,
            },
          ]
        : [],
    ),
    [
      {
        subject: "/carrier-prime",
        polarities: [
          { role: "normal", polarity: "madurai", quantity: 1 },
          { role: "normal", polarity: "penjaga", quantity: 2 },
        ],
        record: "/carrier-prime:factory-polarities",
      },
    ],
  );

  await assert.rejects(
    collect(new WfcdItemsAdapter(), {
      ...snapshot,
      bytes: new TextEncoder().encode(
        JSON.stringify([
          {
            uniqueName: "/invalid-companion",
            name: "Invalid Companion",
            category: "Sentinels",
            polarities: ["future"],
          },
        ]),
      ),
    }),
    /Invalid Companion has invalid polarity/,
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

test("WFCD declared resources do not become parent-qualified components", async () => {
  const orokinCellId = "/Lotus/Types/Items/MiscItems/OrokinCell";
  const resourceSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/zylok-prime",
          name: "Zylok Prime",
          category: "Secondary",
          components: [
            {
              uniqueName: orokinCellId,
              name: "Orokin Cell",
              category: "Misc",
              itemCount: 5,
            },
          ],
        },
        {
          uniqueName: orokinCellId,
          name: "Orokin Cell",
          category: "Misc",
          type: "Resource",
        },
      ]),
    ),
  };

  const observations = await collect(new WfcdItemsAdapter(), resourceSnapshot);
  const cellEntities = observations.filter(
    (entry) =>
      entry.type === "entity" && entry.externalIds[0]?.value === orokinCellId,
  );
  assert.ok(cellEntities.length >= 2);
  assert.ok(
    cellEntities.every(
      (entry) =>
        entry.type === "entity" &&
        entry.kind === "resource" &&
        entry.fields.name === "Orokin Cell" &&
        entry.fields.slug === "orokin-cell",
    ),
  );
});

test("WFCD shared equipment parts retain provider-qualified names", async () => {
  const sharedPart = {
    uniqueName: "/Lotus/Types/Recipes/WarframeRecipes/EmberSystemsComponent",
    name: "Systems",
    category: "Components",
    itemCount: 1,
  };
  const sharedSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/ephemera",
          name: "Blazing Step Ephemera",
          category: "Skins",
          components: [sharedPart],
        },
        {
          uniqueName: "/ember",
          name: "Ember",
          category: "Warframes",
          components: [sharedPart],
        },
      ]),
    ),
  };
  const observations = await collect(new WfcdItemsAdapter(), sharedSnapshot);
  assert.deepEqual(
    observations.flatMap((entry) =>
      entry.type === "entity" &&
      entry.externalIds[0]?.value === sharedPart.uniqueName
        ? [[entry.kind, entry.fields.name, entry.fields.slug]]
        : [],
    ),
    [
      ["component", "Ember Systems", "ember-systems"],
      ["component", "Ember Systems", "ember-systems"],
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
      ["decoration", "The Steel Path - 1999", "the-steel-path-1999"],
      ["cosmetic", "The Steel Path: 1999", "the-steel-path-1999"],
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

test("WFCD adapter classifies provider taxonomy and retains embedded item drops", async () => {
  const typedSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(
      JSON.stringify([
        {
          uniqueName: "/glyph",
          name: "Operator Glyph",
          category: "Glyphs",
          type: "Glyph",
        },
        {
          uniqueName: "/challenge",
          name: "Complete three missions",
          category: "Misc",
          type: "Nightwave Challenge",
        },
        {
          uniqueName: "/nokko",
          name: "Nokko",
          category: "Warframes",
          components: [
            {
              uniqueName: "/nokko-neuroptics",
              name: "Neuroptics",
              category: "Components",
              drops: [
                {
                  location: "Nokko: Weed The Gardens Rewards, Rotation C",
                  chance: 10,
                },
              ],
            },
          ],
        },
      ]),
    ),
  };

  const observations = await collect(new WfcdItemsAdapter(), typedSnapshot);
  const entities = observations.filter((entry) => entry.type === "entity");
  assert.equal(
    entities.find((entry) => entry.fields.name === "Operator Glyph")?.kind,
    "cosmetic",
  );
  assert.equal(
    entities.find((entry) => entry.fields.name === "Complete three missions")
      ?.kind,
    "challenge",
  );
  const drop = observations.find((entry) => entry.type === "drop");
  assert.equal(
    drop?.locationLabel,
    "Nokko: Weed The Gardens Rewards, Rotation C",
  );
  assert.equal(drop?.chance, 0.1);
  assert.equal(drop?.rewardExternalId.value, "/nokko-neuroptics");
  assert.deepEqual(drop?.nodeExternalId, {
    sourceId: "warframe-wiki-missions",
    namespace: "mission-name",
    value: "Deepmines",
  });
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
          uniqueName: "/Lotus/Weapons/SolarisUnited/Secondary/Set/Clip/Splat",
          name: "Splat",
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
          uniqueName: "/Lotus/Weapons/Ostron/Melee/Set/Balance/Jai",
          name: "Jai",
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
        entry.fields.modularPartRole,
      ]),
    [
      ["Braton", "weapon", "primary", undefined],
      ["Dread", "weapon", "bow", undefined],
      ["Boar", "weapon", "shotgun", undefined],
      ["Lex", "weapon", "secondary", undefined],
      ["Sirocco", "weapon", "amp", undefined],
      ["Catchmoon", "weapon", "kitgun", "kitgun-chamber"],
      ["Haymaker", "component", undefined, "kitgun-grip"],
      ["Splat", "component", undefined, "kitgun-loader"],
      ["Balla", "weapon", "zaw", "zaw-strike"],
      ["Peye", "component", undefined, "zaw-grip"],
      ["Jai", "component", undefined, "zaw-link"],
      ["Odonata", "archwing", undefined, undefined],
    ],
  );

  await assert.rejects(
    collect(new WfcdItemsAdapter(), {
      ...snapshot,
      bytes: new TextEncoder().encode(
        JSON.stringify([
          {
            uniqueName: "/future/part",
            name: "Future Part",
            category: "Misc",
            type: "Kitgun Component",
          },
        ]),
      ),
    }),
    /has an unknown part role/,
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
    assert.equal(fetched.version, "fixture-etag|wfcd-items-v18");
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
    (entry) => entry.type === "entity" && entry.kind === "relic",
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

test("drop adapter uses its archived mod index and typed reward fallbacks", async () => {
  const observations = await collect(new WfcdDropsAdapter(), {
    ...snapshot,
    sourceId: "wfcd-drops",
    bytes: new TextEncoder().encode(
      JSON.stringify({
        modNames: ["Ammo Drum"],
        missionRewards: {
          Mercury: {
            Lares: {
              rewards: [
                { itemName: "Ammo Drum" },
                { itemName: "Nokko Neuroptics Blueprint" },
                { itemName: "100 Endo" },
                { itemName: "Unclassified Reward" },
              ],
            },
          },
        },
      }),
    ),
  });
  assert.deepEqual(
    observations
      .filter((entry) => entry.type === "entity")
      .filter((entry) => entry.kind !== "node")
      .map((entry) => [entry.fields.name, entry.kind]),
    [
      ["Ammo Drum", "mod"],
      ["Nokko Neuroptics Blueprint", "blueprint"],
      ["100 Endo", "resource"],
      ["Unclassified Reward", "misc"],
    ],
  );
});

test("drop adapter bridges uniquely named rewards to canonical WFCD item identities", async () => {
  const observations = await collect(new WfcdDropsAdapter(), {
    ...snapshot,
    sourceId: "wfcd-drops",
    bytes: new TextEncoder().encode(
      JSON.stringify({
        itemIdentities: [
          {
            uniqueName: "/Lotus/Types/Items/MiscItems/OrokinCell",
            name: "Orokin Cell",
            category: "Resources",
            type: "Resource",
            kind: "resource",
          },
          {
            uniqueName: "/Lotus/Upgrades/CosmeticEnhancers/ArcaneEnergize",
            name: "Arcane Energize",
            category: "Arcanes",
            type: "Warframe Arcane",
            kind: "arcane",
          },
          {
            uniqueName: "/Lotus/Types/Recipes/Weapons/AkbroncoBlueprint",
            name: "Akbronco Blueprint",
            category: "Components",
            type: "Blueprint",
            kind: "component",
          },
        ],
        modNames: ["Arcane Energize"],
        missionRewards: {
          Saturn: {
            Helene: {
              rewards: [
                { _id: "cell-drop", itemName: "Orokin Cell" },
                { _id: "arcane-drop", itemName: "Arcane Energize" },
                { _id: "blueprint-drop", itemName: "Akbronco Blueprint" },
              ],
            },
          },
        },
      }),
    ),
  });
  const rewards = observations.flatMap((entry) =>
    entry.type === "entity" && entry.kind !== "node" ? [entry] : [],
  );
  assert.deepEqual(
    rewards.map((entry) => [entry.fields.name, entry.kind]),
    [
      ["Orokin Cell", "resource"],
      ["Arcane Energize", "arcane"],
      ["Akbronco Blueprint", "component"],
    ],
  );
  assert.deepEqual(
    rewards.map((entry) =>
      entry.externalIds.map(({ sourceId, namespace, value }) => [
        sourceId,
        namespace,
        value,
      ]),
    ),
    [
      [
        ["wfcd-drops", "reward", "cell-drop"],
        ["wfcd-items", "uniqueName", "/Lotus/Types/Items/MiscItems/OrokinCell"],
      ],
      [
        ["wfcd-drops", "reward", "arcane-drop"],
        [
          "wfcd-items",
          "uniqueName",
          "/Lotus/Upgrades/CosmeticEnhancers/ArcaneEnergize",
        ],
      ],
      [
        ["wfcd-drops", "reward", "blueprint-drop"],
        [
          "wfcd-items",
          "uniqueName",
          "/Lotus/Types/Recipes/Weapons/AkbroncoBlueprint",
        ],
      ],
    ],
  );
});
