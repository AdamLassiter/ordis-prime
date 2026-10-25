import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiVendorsAdapter,
  type Snapshot,
} from "../src/index.ts";

test("wiki vendor adapter imports priced offerings and a cited node link", async () => {
  const observations = await collect(
    new WarframeWikiVendorsAdapter(),
    wikiSnapshot(`
      return {
        Vendors = {
          Nightcap = {
            Name = "Nightcap",
            Currency = "Fergolyte",
            Offerings = {
              { "Nokko Blueprint", "Blueprint", 240, Prereq = 4 },
              { "Kuva", "Resource", 75, 7000, Prereq = 3 },
            },
          },
          ["Bird 3"] = {
            Name = "Bird 3",
            Currency = "Standing",
            Offerings = {
              { "Melee Influence", "Arcane", 7500, 1, Prereq = 4 },
            },
          },
        },
      }
    `),
  );

  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity" &&
        observation.kind === "vendor" &&
        observation.fields.name === "Nightcap",
    ),
    true,
  );
  const standing = observations.find(
    (observation) => observation.type === "vendor-offering",
  );
  assert.ok(standing?.type === "vendor-offering");
  assert.deepEqual(
    {
      ...standing,
      evidence: {
        ...standing.evidence,
        citationUrl: undefined,
        path: undefined,
      },
    },
    {
      type: "vendor-offering",
      vendorExternalId: {
        sourceId: "warframe-wiki-vendors",
        namespace: "vendor-record",
        value: "Bird 3",
      },
      itemExternalId: {
        sourceId: "warframe-wiki-vendors",
        namespace: "offering-v2-arcane",
        value: "Melee Influence",
      },
      faction: "Cavia",
      currency: "Standing",
      cost: 7500,
      quantity: 1,
      prerequisiteRank: 4,
      prerequisiteLabel: "rank 4",
      evidence: {
        sourceId: "warframe-wiki-vendors",
        sourceRecordKey: "Vendors:Bird 3:offering:0:structured",
        snapshotVersion: "fixture-1",
        retrievedAt: "2026-10-22T00:00:00.000Z",
        citationUrl: undefined,
        license: "CC BY-NC-SA 3.0",
        path: undefined,
      },
    },
  );
  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity-relation" &&
        observation.kind === "offers" &&
        observation.toExternalId.value === "Nokko Blueprint" &&
        observation.notes === "1 for 240 Fergolyte · requires rank 4",
    ),
    true,
  );
  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity-relation" &&
        observation.kind === "occurs-at" &&
        observation.toExternalId.sourceId === "warframe-wiki-missions" &&
        observation.toExternalId.value === "Fortuna",
    ),
    true,
  );
  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity-attribute" &&
        observation.key === "deepmines-bounties" &&
        observation.value ===
          "Critter Liberation · Corporate Restructuring · Weed The Garden",
    ),
    true,
  );
  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity-relation" &&
        observation.kind === "involves" &&
        observation.fromExternalId.value === "Nightcap" &&
        observation.toExternalId.value === "Deepmines" &&
        observation.notes?.includes("Corporate Restructuring"),
    ),
    true,
  );
});

function wikiSnapshot(moduleContent: string): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      query: {
        pages: [
          {
            title: "Module:Vendors/data",
            revisions: [
              {
                revid: 123,
                slots: { main: { content: moduleContent } },
              },
            ],
          },
          {
            title: "Nightcap",
            revisions: [
              {
                revid: 456,
                slots: { main: { content: "Nightcap is in Fortuna." } },
              },
            ],
          },
          {
            title: "Bounty",
            revisions: [
              {
                revid: 789,
                slots: {
                  main: {
                    content: `
==Deepmines Bounties==
===Mission Bounties===
{| class="wikitable"
| Tier 1 (Critter Liberation) || 30-40 || Entrance Caves & Corpus Labs
|-
| Tier 2 (Corporate Restructuring) || 30-40 || Entrance Caves & Forward Base
|-
| Tier 3 (Weed The Garden) || 30-40 || Entrance Caves & Nutrient Processing
|}
==Other Bounties==
`,
                  },
                },
              },
            ],
          },
        ],
      },
    }),
  );
  return {
    sourceId: "warframe-wiki-vendors",
    version: "fixture-1",
    retrievedAt: "2026-10-22T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
