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
