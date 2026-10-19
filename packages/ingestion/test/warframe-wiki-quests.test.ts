import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiQuestsAdapter,
  type Snapshot,
} from "../src/index.ts";

test("wiki quest adapter imports quests and sequence links without treating missions as quests", async () => {
  const observations = await collect(
    new WarframeWikiQuestsAdapter(),
    wikiSnapshot(`
      return {
        ["Vor's Prize"] = {
          Name = "Vor's Prize",
          Type = "Main Quest",
          Description = "Wake up,   Tenno.",
        },
        ["Once Awake"] = {
          Name = "Once Awake",
          Type = "Main Quest",
          Description = "Investigate.\\r\\n\\r\\nBe careful.",
          PreviousQuest = "Vor's Prize",
        },
        ["A Side Story"] = {
          Name = "A Side Story",
          Type = "Optional Quest",
          Description = "Optional work.",
        },
        ["A Mission Key"] = {
          Name = "A Mission Key",
          Type = "Mission",
          Description = "Not a quest.",
        },
      }
    `),
  );

  assert.deepEqual(
    observations
      .filter((observation) => observation.type === "entity")
      .map((observation) => ({
        name: observation.fields.name,
        description: observation.fields.description,
      })),
    [
      { name: "Vor's Prize", description: "Wake up, Tenno." },
      { name: "Once Awake", description: "Investigate. Be careful." },
      { name: "A Side Story", description: "Optional work." },
    ],
  );
  assert.deepEqual(
    observations
      .filter((observation) => observation.type === "entity-relation")
      .map((observation) => ({
        kind: observation.kind,
        from: observation.fromExternalId.value,
        to: observation.toExternalId.value,
        citationUrl: observation.evidence.citationUrl,
      })),
    [
      {
        kind: "follows",
        from: "Once Awake",
        to: "Vor's Prize",
        citationUrl: "https://wiki.warframe.com/w/Module:Keys/data?oldid=73",
      },
    ],
  );
});

test("wiki quest adapter rejects dangling sequence links", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiQuestsAdapter(),
      wikiSnapshot(`
        return {
          Awakening = {
            Name = "Awakening",
            Type = "Main Quest",
            PreviousQuest = "Missing Quest",
          },
        }
      `),
    ),
    /Awakening has unknown PreviousQuest Missing Quest/,
  );
});

test("wiki quest adapter rejects cyclic sequence links", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiQuestsAdapter(),
      wikiSnapshot(`
        return {
          First = {
            Name = "First",
            Type = "Main Quest",
            PreviousQuest = "Second",
          },
          Second = {
            Name = "Second",
            Type = "Main Quest",
            PreviousQuest = "First",
          },
        }
      `),
    ),
    /quest sequence contains a cycle/,
  );
});

test("wiki quest adapter fails closed when no quest records remain", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiQuestsAdapter(),
      wikiSnapshot(`
        return {
          Key = { Name = "Key", Type = "Mission" },
        }
      `),
    ),
    /has no quests/,
  );
});

function wikiSnapshot(content: string): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      query: {
        pages: [
          {
            title: "Module:Keys/data",
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
    sourceId: "warframe-wiki-quests",
    version: "fixture-1",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
