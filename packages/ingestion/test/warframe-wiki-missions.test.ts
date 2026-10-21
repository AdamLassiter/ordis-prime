import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiMissionsAdapter,
  type Snapshot,
} from "../src/index.ts";

test("wiki mission adapter imports nodes and deduplicated connections", async () => {
  const observations = await collect(
    new WarframeWikiMissionsAdapter(),
    wikiSnapshot(`
      local MissionData = {
        FactionImages = { Grineer = "grineer.svg" },
        MissionDetails = {
          { Name = "E Gate", Planet = "Venus", Type = "Exterminate", Enemy = "Corpus", MinLevel = 3, MaxLevel = 5, NextNodes = { "Tessera", "Fortuna" }, Requirements = "Must be [[Mastery Rank]] 5 or higher to access" },
          { Name = "Tessera", Planet = "Venus", PreviousNodes = { "E Gate" } },
          { Name = "Fortuna", Planet = "Venus", PreviousNodes = { "E Gate" } },
        },
      }
      return MissionData
    `),
  );

  assert.deepEqual(
    observations.map((observation) =>
      observation.type === "entity"
        ? {
            type: observation.type,
            name: observation.fields.name,
            externalId: observation.externalIds[0],
          }
        : observation.type === "node-detail"
          ? {
              type: observation.type,
              name: observation.nodeExternalId.value,
              planet: observation.planet,
              missionType: observation.missionType,
              faction: observation.faction,
              levels: [
                observation.minimumEnemyLevel,
                observation.maximumEnemyLevel,
              ],
              masteryRequirement: observation.masteryRequirement,
            }
          : observation.type === "entity-relation"
            ? {
                type: observation.type,
                kind: observation.kind,
                from: observation.fromExternalId.value,
                to: observation.toExternalId.value,
                citationUrl: observation.evidence.citationUrl,
              }
            : null,
    ),
    [
      {
        type: "entity",
        name: "E Gate",
        externalId: {
          sourceId: "warframe-wiki-missions",
          namespace: "mission-name",
          value: "E Gate",
        },
      },
      {
        type: "entity",
        name: "Tessera",
        externalId: {
          sourceId: "warframe-wiki-missions",
          namespace: "mission-name",
          value: "Tessera",
        },
      },
      {
        type: "entity",
        name: "Fortuna",
        externalId: {
          sourceId: "warframe-wiki-missions",
          namespace: "mission-name",
          value: "Fortuna",
        },
      },
      {
        type: "node-detail",
        name: "E Gate",
        planet: "Venus",
        missionType: "Exterminate",
        faction: "Corpus",
        levels: [3, 5],
        masteryRequirement: 5,
      },
      {
        type: "node-detail",
        name: "Tessera",
        planet: "Venus",
        missionType: undefined,
        faction: undefined,
        levels: [undefined, undefined],
        masteryRequirement: undefined,
      },
      {
        type: "node-detail",
        name: "Fortuna",
        planet: "Venus",
        missionType: undefined,
        faction: undefined,
        levels: [undefined, undefined],
        masteryRequirement: undefined,
      },
      {
        type: "entity-relation",
        kind: "connects-to",
        from: "E Gate",
        to: "Tessera",
        citationUrl:
          "https://wiki.warframe.com/w/Module:Missions/data?oldid=73",
      },
      {
        type: "entity-relation",
        kind: "connects-to",
        from: "E Gate",
        to: "Fortuna",
        citationUrl:
          "https://wiki.warframe.com/w/Module:Missions/data?oldid=73",
      },
    ],
  );
});

test("wiki mission adapter rejects dangling connections", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiMissionsAdapter(),
      wikiSnapshot(`
        return {
          MissionDetails = {
            { Name = "E Gate", Planet = "Venus", NextNodes = { "Missing" } },
          },
        }
      `),
    ),
    /E Gate references missing node Missing/,
  );
});

test("wiki mission adapter imports bosses and their mission links", async () => {
  const observations = await collect(
    new WarframeWikiMissionsAdapter(),
    wikiSnapshot(`
      return {
        MissionDetails = {
          { Name = "Fossa", Planet = "Venus", Boss = "Jackal", NextNodes = { "Kiliken" } },
          { Name = "Kiliken", Planet = "Venus", PreviousNodes = { "Fossa" } },
        },
      }
    `),
  );
  const boss = observations.find(
    (observation) =>
      observation.type === "entity" && observation.kind === "boss",
  );
  assert.deepEqual(
    boss?.type === "entity"
      ? {
          name: boss.fields.name,
          slug: boss.fields.slug,
          externalId: boss.externalIds[0],
        }
      : undefined,
    {
      name: "Jackal",
      slug: "jackal",
      externalId: {
        sourceId: "warframe-wiki-missions",
        namespace: "boss-name",
        value: "Jackal",
      },
    },
  );
  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity-relation" &&
        observation.kind === "occurs-at" &&
        observation.fromExternalId.value === "Jackal" &&
        observation.toExternalId.value === "Fossa",
    ),
    true,
  );
});

test("wiki mission adapter imports only complete quest and node requirements", async () => {
  const observations = await collect(
    new WarframeWikiMissionsAdapter(),
    wikiSnapshot(
      `
        return {
          MissionDetails = {
            { Name = "Sanctuary Onslaught", Planet = "Sanctuary", NextNodes = { "Armatus" }, Requirements = "Must have [[The New Strange (Quest)|The New Strange]] completed to access" },
            { Name = "Armatus", Planet = "Deimos", PreviousNodes = { "Sanctuary Onslaught" }, NextNodes = { "Elite Sanctuary Onslaught" }, Requirements = "Must have [[The Deadlock Protocol]] and [[Whispers in the Walls]] completed to access" },
            { Name = "Elite Sanctuary Onslaught", Planet = "Sanctuary", PreviousNodes = { "Armatus" }, NextNodes = { "Lower Vehrvod" }, Requirements = "Must have [[The New Strange]] completed to access and a level 30 Warframe" },
            { Name = "Lower Vehrvod", Planet = "Tau", PreviousNodes = { "Elite Sanctuary Onslaught" }, NextNodes = { "Vehrvod District" }, Requirements = "Must have [[The Hex (Quest)]] completed to access" },
            { Name = "Vehrvod District", Planet = "Tau", PreviousNodes = { "Lower Vehrvod" }, NextNodes = { "Node Gate" }, Requirements = "Must have [[The Hex (Quest)]] completed to access\\nMust have [[Lower Vehrvod]] completed" },
            { Name = "Node Gate", Planet = "Tau", PreviousNodes = { "Vehrvod District" }, Requirements = "Must have [[Vehrvod District]] completed to access" },
          },
        }
      `,
      `
        return {
          ["The New Strange"] = { Name = "The New Strange", Link = "The New Strange (Quest)", Type = "Optional Quest" },
          ["The Deadlock Protocol"] = { Name = "The Deadlock Protocol", Link = "The Deadlock Protocol", Type = "Optional Quest" },
          ["Whispers in the Walls"] = { Name = "Whispers in the Walls", Link = "Whispers in the Walls", Type = "Main Quest" },
          ["The Hex"] = { Name = "The Hex", Link = "The Hex (Quest)", Type = "Main Quest" },
        }
      `,
    ),
  );

  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "entity" && observation.kind === "quest"
        ? [observation.fields.name]
        : [],
    ),
    [
      "The New Strange",
      "The Deadlock Protocol",
      "Whispers in the Walls",
      "The Hex",
    ],
  );
  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "entity-relation" && observation.kind === "requires"
        ? [
            {
              node: observation.fromExternalId.value,
              prerequisite: observation.toExternalId.value,
              namespace: observation.toExternalId.namespace,
            },
          ]
        : [],
    ),
    [
      {
        node: "Sanctuary Onslaught",
        prerequisite: "The New Strange",
        namespace: "quest-name",
      },
      {
        node: "Armatus",
        prerequisite: "The Deadlock Protocol",
        namespace: "quest-name",
      },
      {
        node: "Armatus",
        prerequisite: "Whispers in the Walls",
        namespace: "quest-name",
      },
      {
        node: "Elite Sanctuary Onslaught",
        prerequisite: "The New Strange",
        namespace: "quest-name",
      },
      {
        node: "Lower Vehrvod",
        prerequisite: "The Hex",
        namespace: "quest-name",
      },
      {
        node: "Vehrvod District",
        prerequisite: "The Hex",
        namespace: "quest-name",
      },
      {
        node: "Vehrvod District",
        prerequisite: "Lower Vehrvod",
        namespace: "mission-name",
      },
      {
        node: "Node Gate",
        prerequisite: "Vehrvod District",
        namespace: "mission-name",
      },
    ],
  );
  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "node-detail" &&
      observation.nodeExternalId.value === "Elite Sanctuary Onslaught"
        ? [observation.warframeRankRequirement]
        : [],
    ),
    [30],
  );
});

test("wiki mission adapter imports only complete Railjack Intrinsic expressions", async () => {
  const observations = await collect(
    new WarframeWikiMissionsAdapter(),
    wikiSnapshot(
      `
        return {
          MissionDetails = {
            { Name = "Saturn Gate", Planet = "Saturn Proxima", NextNodes = { "Veil Gate" }, Requirements = "Must have [[Intrinsics]] Rank 3 or higher to access" },
            { Name = "Veil Gate", Planet = "Veil Proxima", PreviousNodes = { "Saturn Gate" }, NextNodes = { "Erato" }, Requirements = "Must have [[Intrinsics]] Rank 7 or higher to access and [[Chimera Prologue]] completed" },
            { Name = "Erato", Planet = "Veil Proxima", PreviousNodes = { "Veil Gate" }, NextNodes = { "Lich Gate" }, Requirements = "Must have [[The War Within]] completed and [[Intrinsics]] Rank 7 or higher to access and [[Chimera Prologue]] completed" },
            { Name = "Lich Gate", Planet = "Saturn Proxima", PreviousNodes = { "Erato" }, NextNodes = { "Sister Gate" }, Requirements = "Must have [[Intrinsics]] Rank 3 or higher and an active [[Kuva Lich]] to access" },
            { Name = "Sister Gate", Planet = "Neptune Proxima", PreviousNodes = { "Lich Gate" }, NextNodes = { "Coda Gate" }, Requirements = "Must have [[Intrinsics]] Rank 3 or higher and an active [[Sister of Parvos]] to access" },
            { Name = "Coda Gate", Planet = "Earth Proxima", PreviousNodes = { "Sister Gate" }, Requirements = "Must complete [[The Hex (Quest)|The Hex]] quest to access and active [[Technocyte Coda]]." },
          },
        }
      `,
      `
        return {
          ["The War Within"] = { Name = "The War Within", Link = "The War Within", Type = "Main Quest" },
          ["Chimera Prologue"] = { Name = "Chimera Prologue", Link = "Chimera Prologue", Type = "Main Quest" },
          ["The Hex"] = { Name = "The Hex", Link = "The Hex (Quest)", Type = "Main Quest" },
        }
      `,
    ),
  );

  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "node-detail"
        ? [
            {
              node: observation.nodeExternalId.value,
              rank: observation.railjackIntrinsicRequirement,
              adversary: observation.activeAdversaryRequirement,
            },
          ]
        : [],
    ),
    [
      { node: "Saturn Gate", rank: 3, adversary: undefined },
      { node: "Veil Gate", rank: 7, adversary: undefined },
      { node: "Erato", rank: 7, adversary: undefined },
      { node: "Lich Gate", rank: 3, adversary: "kuva-lich" },
      { node: "Sister Gate", rank: 3, adversary: "sister-of-parvos" },
      { node: "Coda Gate", rank: undefined, adversary: "technocyte-coda" },
    ],
  );
  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "entity-relation" && observation.kind === "requires"
        ? [
            {
              node: observation.fromExternalId.value,
              quest: observation.toExternalId.value,
            },
          ]
        : [],
    ),
    [
      { node: "Veil Gate", quest: "Chimera Prologue" },
      { node: "Erato", quest: "The War Within" },
      { node: "Erato", quest: "Chimera Prologue" },
      { node: "Coda Gate", quest: "The Hex" },
    ],
  );
});

test("wiki mission adapter imports exact inventory requirements", async () => {
  const observations = await collect(
    new WarframeWikiMissionsAdapter(),
    wikiSnapshot(`
      return {
        MissionDetails = {
          { Name = "Nakki", Planet = "Sedna", NextNodes = { "Yam" } },
          { Name = "Yam", Planet = "Sedna", PreviousNodes = { "Nakki" }, NextNodes = { "Vodyanoi" }, Requirements = "Must have 10 [[Judgement Points]] to access" },
          { Name = "Vodyanoi", Planet = "Sedna", PreviousNodes = { "Yam" }, NextNodes = { "Hades" }, Requirements = "Must have 15 [[Judgement Points]] to access" },
          { Name = "Hades", Planet = "Pluto", PreviousNodes = { "Vodyanoi" }, NextNodes = { "Grendel" }, Requirements = "Must have 5 [[Animo Nav Beacon]]s to access" },
          { Name = "Grendel", Planet = "Europa", PreviousNodes = { "Hades" }, Requirements = "Must have [[Grendel Chassis Locator]] to access" },
          { Name = "Grendel Neuroptics", Planet = "Europa", Requirements = "Must have [[Grendel Neuroptics Locator]] to access" },
          { Name = "Grendel Systems", Planet = "Europa", Requirements = "Must have [[Grendel Systems Locator]] to access" },
          { Name = "Mutalist Alad V Assassinate", Planet = "Eris", Requirements = "Must have [[Mutalist Alad V Assassinate Key]] to access" },
          { Name = "Unsupported Signal", Planet = "Void", Requirements = "Must have [[Baro Void-Signal]] to access" },
        },
      }
    `),
  );

  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "entity" && observation.kind === "resource"
        ? [observation.fields.name]
        : [],
    ),
    [
      "Judgement Points",
      "Animo Nav Beacon",
      "Grendel Chassis Locator",
      "Grendel Neuroptics Locator",
      "Grendel Systems Locator",
      "Mutalist Alad V Assassinate Key",
    ],
  );
  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "node-item-requirement"
        ? [
            {
              node: observation.nodeExternalId.value,
              item: observation.itemExternalId.value,
              quantity: observation.quantity,
            },
          ]
        : [],
    ),
    [
      { node: "Yam", item: "Judgement Points", quantity: 10 },
      { node: "Vodyanoi", item: "Judgement Points", quantity: 15 },
      { node: "Hades", item: "Animo Nav Beacon", quantity: 5 },
      { node: "Grendel", item: "Grendel Chassis Locator", quantity: 1 },
      {
        node: "Grendel Neuroptics",
        item: "Grendel Neuroptics Locator",
        quantity: 1,
      },
      {
        node: "Grendel Systems",
        item: "Grendel Systems Locator",
        quantity: 1,
      },
      {
        node: "Mutalist Alad V Assassinate",
        item: "Mutalist Alad V Assassinate Key",
        quantity: 1,
      },
    ],
  );
});

test("wiki mission adapter rejects an out-of-range exact Mastery gate", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiMissionsAdapter(),
      wikiSnapshot(`
        return {
          MissionDetails = {
            { Name = "Relay", Planet = "Earth", NextNodes = { "Node" }, Requirements = "Must be [[Mastery Rank]] 31 or higher to access" },
            { Name = "Node", Planet = "Earth", PreviousNodes = { "Relay" } },
          },
        }
      `),
    ),
    /Mastery Rank requirement is invalid/,
  );
});

test("wiki mission adapter rejects an out-of-range Railjack Intrinsic gate", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiMissionsAdapter(),
      wikiSnapshot(`
        return {
          MissionDetails = {
            { Name = "Railjack", Planet = "Proxima", NextNodes = { "Node" }, Requirements = "Must have [[Intrinsics]] Rank 11 or higher to access" },
            { Name = "Node", Planet = "Proxima", PreviousNodes = { "Railjack" } },
          },
        }
      `),
    ),
    /Railjack Intrinsic requirement is invalid/,
  );
});

test("wiki mission adapter rejects an out-of-range Warframe rank gate", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiMissionsAdapter(),
      wikiSnapshot(
        `
          return {
            MissionDetails = {
              { Name = "Elite", Planet = "Sanctuary", Requirements = "Must have [[The New Strange]] completed to access and a level 31 Warframe" },
            },
          }
        `,
        `
          return {
            ["The New Strange"] = { Name = "The New Strange", Link = "The New Strange", Type = "Optional Quest" },
          }
        `,
      ),
    ),
    /Warframe rank requirement is invalid/,
  );
});

function wikiSnapshot(
  content: string,
  questContent = `
    return {
      Awakening = { Name = "Awakening", Link = "Awakening", Type = "Main Quest" },
    }
  `,
): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      query: {
        pages: [
          {
            title: "Module:Missions/data",
            revisions: [
              {
                revid: 73,
                slots: { main: { content } },
              },
            ],
          },
          {
            title: "Module:Keys/data",
            revisions: [
              {
                revid: 81,
                slots: { main: { content: questContent } },
              },
            ],
          },
        ],
      },
    }),
  );
  return {
    sourceId: "warframe-wiki-missions",
    version: "fixture-1",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
