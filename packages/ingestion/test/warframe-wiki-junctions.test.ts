import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiJunctionsAdapter,
  type Snapshot,
} from "../src/index.ts";

const junctionTitles = [
  "Venus Junction",
  "Mercury Junction",
  "Mars Junction",
  "Phobos Junction",
  "Ceres Junction",
  "Jupiter Junction",
  "Europa Junction",
  "Saturn Junction",
  "Uranus Junction",
  "Neptune Junction",
  "Pluto Junction",
  "Eris Junction",
  "Sedna Junction",
] as const;

test("wiki Junction adapter imports four cited objectives per Junction", async () => {
  const observations = await collect(
    new WarframeWikiJunctionsAdapter(),
    wikiSnapshot(junctionTasks()),
  );

  const nodes = observations.filter(({ type }) => type === "entity");
  const objectives = observations.filter(
    ({ type }) => type === "node-objective",
  );
  assert.equal(nodes.length, 13);
  assert.equal(objectives.length, 52);
  assert.deepEqual(nodes[0], {
    type: "entity",
    kind: "node",
    externalIds: [
      {
        sourceId: "warframe-wiki-junctions",
        namespace: "page-title",
        value: "Venus Junction",
      },
    ],
    fields: { name: "Venus Junction", slug: "venus-junction" },
    evidence: {
      sourceId: "warframe-wiki-junctions",
      snapshotVersion: "fixture-1",
      retrievedAt: "2026-10-20T00:00:00.000Z",
      license: "CC BY-NC-SA 3.0",
      sourceRecordKey: "page:Venus Junction",
      citationUrl: "https://wiki.warframe.com/w/Venus_Junction?oldid=1000",
      path: "Venus Junction",
    },
  });
  assert.deepEqual(
    objectives.slice(0, 4).map((objective) =>
      objective.type === "node-objective"
        ? {
            key: objective.key,
            label: objective.label,
            hint: objective.hint,
            sortOrder: objective.sortOrder,
          }
        : undefined,
    ),
    [
      {
        key: "bdfae91a0ec464a5",
        label: "Complete Quest: The Teacher",
        hint: "Activate new quests using the Codex in your Orbiter.",
        sortOrder: 0,
      },
      {
        key: "a4896ed4523654d0",
        label: "Equip Dreamer's Bond in your Warframe's Aura Slot",
        hint: "Dreamer's Bond is a Warframe Aura Mod.",
        sortOrder: 1,
      },
      {
        key: "bfa748cc183db1a9",
        label: "Upgrade Dreamer's Bond Mod",
        hint: "Mods can be upgraded from the Mod Interface.",
        sortOrder: 2,
      },
      {
        key: "831a371c3274f989",
        label: "Start building a Taxon Sentinel in the Foundry",
        hint: "View all available blueprints in the Foundry.",
        sortOrder: 3,
      },
    ],
  );
  assert.deepEqual(
    objectives[0]?.type === "node-objective"
      ? {
          nodeExternalId: objectives[0].nodeExternalId,
          evidence: objectives[0].evidence,
        }
      : undefined,
    {
      nodeExternalId: {
        sourceId: "warframe-wiki-junctions",
        namespace: "page-title",
        value: "Venus Junction",
      },
      evidence: {
        sourceId: "warframe-wiki-junctions",
        snapshotVersion: "fixture-1",
        retrievedAt: "2026-10-20T00:00:00.000Z",
        license: "CC BY-NC-SA 3.0",
        sourceRecordKey: "Venus Junction:task:bdfae91a0ec464a5",
        citationUrl: "https://wiki.warframe.com/w/Venus_Junction?oldid=1000",
        path: "Venus Junction > Junction Tasks > 1",
      },
    },
  );
  assert.equal(
    objectives.some(
      (objective) =>
        objective.type === "node-objective" &&
        objective.label === "Complete the Junction",
    ),
    false,
  );
});

test("wiki Junction adapter rejects a changed task-table shape", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiJunctionsAdapter(),
      wikiSnapshot(junctionTasks().replace("|-\n|Upgrade", "|Upgrade")),
    ),
    /has 3 Junction tasks; expected 4/,
  );
});

function junctionTasks(): string {
  return `
==Junction Tasks==
{| class="article-table"
!Location
!Tasks
!Hint
!Rewards
|-
| rowspan="6"| [[Earth]]
|-
|Complete Quest: [[The Teacher]]
|Activate new quests using the [[Codex]] in your [[Orbiter]].
|
|-
|Equip {{M|Dreamer's Bond}} in your Warframe's Aura Slot
|Dreamer's Bond is a Warframe [[Aura]] Mod.
|
|-
|Upgrade {{M|Dreamer's Bond}} Mod
|[[Mod]]s can be upgraded from the Mod Interface.
|
|-
|Start building a {{Companion|Taxon}} Sentinel in the [[Foundry]]
|View all available blueprints in the Foundry.
|
|-
|Complete the Junction
|
|
|-
|}

==Junction Guardian==
`;
}

function wikiSnapshot(content: string): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      query: {
        pages: junctionTitles.map((title, index) => ({
          title,
          revisions: [
            {
              revid: 1000 + index,
              slots: { main: { content } },
            },
          ],
        })),
      },
    }),
  );
  return {
    sourceId: "warframe-wiki-junctions",
    version: "fixture-1",
    retrievedAt: "2026-10-20T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
