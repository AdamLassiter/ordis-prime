import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiEnemiesAdapter,
  type Snapshot,
} from "../src/index.ts";

const PARTITIONS = [
  "grineer",
  "corpus",
  "infestation",
  "orokin",
  "sentient",
  "stalker",
  "narmer",
  "themurmur",
  "scaldra",
  "techrot",
  "anarchs",
  "unaffiliated",
] as const;

test("wiki enemy adapter imports only explicitly classified bosses", async () => {
  const observations = await collect(
    new WarframeWikiEnemiesAdapter(),
    wikiSnapshot({
      corpus: `
        return {
          JackalRecord = {
            General = {
              Name = "Jackal",
              Description = "A <DT_PUNCTURE_COLOR>large   proxy. Dangerous.",
              Type = "Boss",
            },
          },
          Crewman = {
            General = { Name = "Crewman", Type = "Light" },
          },
          IgnoredBoss = {
            _IgnoreEntry = true,
            General = { Name = "Ignored", Type = "Boss" },
          },
        }
      `,
      narmer: `
        return {
          ["Archon Amar"] = {
            General = { Type = "Boss" },
          },
        }
      `,
      anarchs: `
        return {
          ["Commandeered Ash Prime"] = {
            General = {
              Name = "Commandeered Ash Prime",
              Type = "Boss",
            },
          },
          ["Anarch Arcus"] = {
            General = { Name = "Anarch Arcus", Type = "Ranged" },
          },
        }
      `,
    }),
  );

  assert.deepEqual(
    observations.map((observation) => {
      assert.equal(observation.type, "entity");
      return {
        kind: observation.kind,
        name: observation.fields.name,
        description: observation.fields.description,
        aliases: observation.aliases,
        externalId: observation.externalIds[0]?.value,
        recordKey: observation.evidence.sourceRecordKey,
        citationUrl: observation.evidence.citationUrl,
      };
    }),
    [
      {
        kind: "boss",
        name: "Jackal",
        description: "A large proxy. Dangerous.",
        aliases: ["JackalRecord"],
        externalId: "corpus:JackalRecord",
        recordKey: "corpus:JackalRecord",
        citationUrl:
          "https://wiki.warframe.com/w/Module:Enemies/data/corpus?oldid=102",
      },
      {
        kind: "boss",
        name: "Archon Amar",
        description: undefined,
        aliases: undefined,
        externalId: "narmer:Archon Amar",
        recordKey: "narmer:Archon Amar",
        citationUrl:
          "https://wiki.warframe.com/w/Module:Enemies/data/narmer?oldid=107",
      },
      {
        kind: "boss",
        name: "Commandeered Ash Prime",
        description: undefined,
        aliases: undefined,
        externalId: "anarchs:Commandeered Ash Prime",
        recordKey: "anarchs:Commandeered Ash Prime",
        citationUrl:
          "https://wiki.warframe.com/w/Module:Enemies/data/anarchs?oldid=111",
      },
    ],
  );
});

test("wiki enemy adapter fails closed when the upstream partition set changes", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiEnemiesAdapter(),
      wikiSnapshot({}, [...PARTITIONS, "newfaction"]),
    ),
    /partitions changed \(unsupported: newfaction; missing: none\)/,
  );
});

test("wiki enemy adapter uses source keys to disambiguate duplicate boss names", async () => {
  const observations = await collect(
    new WarframeWikiEnemiesAdapter(),
    wikiSnapshot({
      scaldra: `
        return {
          ["H-09 Efervon Tank"] = {
            General = { Name = "H-09 Efervon Tank", Type = "Boss" },
          },
        }
      `,
      techrot: `
        return {
          ["H-09 Efervon Tank (Techrot)"] = {
            General = { Name = "H-09 Efervon Tank", Type = "Boss" },
          },
        }
      `,
    }),
  );

  assert.deepEqual(
    observations.map((observation) => {
      assert.equal(observation.type, "entity");
      return {
        name: observation.fields.name,
        slug: observation.fields.slug,
        externalId: observation.externalIds[0]?.value,
      };
    }),
    [
      {
        name: "H-09 Efervon Tank",
        slug: "h-09-efervon-tank",
        externalId: "scaldra:H-09 Efervon Tank",
      },
      {
        name: "H-09 Efervon Tank (Techrot)",
        slug: "h-09-efervon-tank-techrot",
        externalId: "techrot:H-09 Efervon Tank (Techrot)",
      },
    ],
  );
});

test("wiki enemy adapter fails closed when no bosses remain", async () => {
  await assert.rejects(
    collect(new WarframeWikiEnemiesAdapter(), wikiSnapshot({})),
    /has no bosses/,
  );
});

function wikiSnapshot(
  content: Partial<Record<(typeof PARTITIONS)[number], string>>,
  declaredPartitions: readonly string[] = PARTITIONS,
): Snapshot {
  const pages = [
    {
      title: "Module:Enemies/data",
      revisions: [
        {
          revid: 100,
          slots: {
            main: {
              content: `
                local COOP_FACTIONS = { ${declaredPartitions.map((value) => `"${value}"`).join(", ")} }
                return {}
              `,
            },
          },
        },
      ],
    },
    ...PARTITIONS.map((partition, index) => ({
      title: `Module:Enemies/data/${partition}`,
      revisions: [
        {
          revid: 101 + index,
          slots: { main: { content: content[partition] ?? "return {}" } },
        },
      ],
    })),
  ];
  const bytes = new TextEncoder().encode(JSON.stringify({ query: { pages } }));
  return {
    sourceId: "warframe-wiki-enemies",
    version: "fixture-1",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
