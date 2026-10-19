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

test("wiki mission adapter imports only complete quest-only access requirements", async () => {
  const observations = await collect(
    new WarframeWikiMissionsAdapter(),
    wikiSnapshot(
      `
        return {
          MissionDetails = {
            { Name = "Sanctuary Onslaught", Planet = "Sanctuary", NextNodes = { "Armatus" }, Requirements = "Must have [[The New Strange (Quest)|The New Strange]] completed to access" },
            { Name = "Armatus", Planet = "Deimos", PreviousNodes = { "Sanctuary Onslaught" }, NextNodes = { "Elite Sanctuary Onslaught" }, Requirements = "Must have [[The Deadlock Protocol]] and [[Whispers in the Walls]] completed to access" },
            { Name = "Elite Sanctuary Onslaught", Planet = "Sanctuary", PreviousNodes = { "Armatus" }, Requirements = "Must have [[The New Strange]] completed to access and a level 30 Warframe" },
          },
        }
      `,
      `
        return {
          ["The New Strange"] = { Name = "The New Strange", Link = "The New Strange (Quest)", Type = "Optional Quest" },
          ["The Deadlock Protocol"] = { Name = "The Deadlock Protocol", Link = "The Deadlock Protocol", Type = "Optional Quest" },
          ["Whispers in the Walls"] = { Name = "Whispers in the Walls", Link = "Whispers in the Walls", Type = "Main Quest" },
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
    ["The New Strange", "The Deadlock Protocol", "Whispers in the Walls"],
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
      { node: "Sanctuary Onslaught", quest: "The New Strange" },
      { node: "Armatus", quest: "The Deadlock Protocol" },
      { node: "Armatus", quest: "Whispers in the Walls" },
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
