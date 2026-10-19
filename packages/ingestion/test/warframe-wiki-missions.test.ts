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
          { Name = "E Gate", Planet = "Venus", Type = "Exterminate", Enemy = "Corpus", MinLevel = 3, MaxLevel = 5, NextNodes = { "Tessera", "Fortuna" } },
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
      },
      {
        type: "node-detail",
        name: "Tessera",
        planet: "Venus",
        missionType: undefined,
        faction: undefined,
        levels: [undefined, undefined],
      },
      {
        type: "node-detail",
        name: "Fortuna",
        planet: "Venus",
        missionType: undefined,
        faction: undefined,
        levels: [undefined, undefined],
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

function wikiSnapshot(content: string): Snapshot {
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
