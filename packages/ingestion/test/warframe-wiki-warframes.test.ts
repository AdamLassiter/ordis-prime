import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiWarframesAdapter,
  type Snapshot,
} from "../src/index.ts";

test("wiki Warframe adapter imports Warframe and Archwing maximum ranks", async () => {
  const observations = await collect(
    new WarframeWikiWarframesAdapter(),
    wikiSnapshot(`
      return {
        Archwings = {
          Odonata = { MaxRank = 30, Name = "Odonata", Polarities = {}, Type = "Archwing" },
        },
        Necramechs = {
          Voidrig = { MaxRank = 40, Name = "Voidrig", Type = "Necramech" },
        },
        Warframes = {
          ["Excalibur Umbra"] = {
            Description = "A warrior’s resolve.",
            Armor = 300,
            Energy = 100,
            Health = 455,
            Passive = "Resists a lethal blow.",
            HealthRank30 = 555,
            InitialEnergy = 50,
            Playstyle = { "Damage", "Tank" },
            Vaulted = true,
            Shield = 300,
            Sprint = 1.1,
            AuraPolarity = "Madurai",
            ExilusPolarity = "None",
            MaxRank = 30,
            Name = "Excalibur Umbra",
            Polarities = { "Umbra", "Umbra", "Umbra" },
            Type = "Warframe",
          },
          Stalker = {
            MaxRank = 30,
            Name = "Stalker",
            Type = "Warframe",
            _IgnoreEntry = true,
          },
        },
      }
    `),
  );

  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "entity"
        ? [
            {
              kind: observation.kind,
              name: observation.fields.name,
              maxRank: observation.fields.equipmentMaxRank,
              citationUrl: observation.evidence.citationUrl,
            },
          ]
        : [],
    ),
    [
      {
        kind: "warframe",
        name: "Excalibur Umbra",
        maxRank: 30,
        citationUrl:
          "https://wiki.warframe.com/w/Module:Warframes/data?oldid=42",
      },
      {
        kind: "archwing",
        name: "Odonata",
        maxRank: 30,
        citationUrl:
          "https://wiki.warframe.com/w/Module:Warframes/data?oldid=42",
      },
    ],
  );
  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "entity-attribute"
        ? [[observation.key, observation.label, observation.value]]
        : [],
    ),
    [
      ["health", "Health", "455"],
      ["shield", "Shield", "300"],
      ["armor", "Armor", "300"],
      ["energy", "Energy", "100"],
      ["sprint-speed", "Sprint speed", "1.1"],
      ["passive", "Passive", "Resists a lethal blow."],
      ["health-rank-30", "Health at rank 30", "555"],
      ["initial-energy", "Starting energy", "50"],
      ["playstyle", "Playstyle", "Damage, Tank"],
      ["vaulted", "Vaulted", "Yes"],
    ],
  );
  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "equipment-polarity-set"
        ? [
            {
              subject: observation.subjectExternalId.value,
              polarities: observation.polarities,
            },
          ]
        : [],
    ),
    [
      {
        subject: "Warframes:Excalibur Umbra",
        polarities: [
          { role: "aura", polarity: "madurai", quantity: 1 },
          { role: "normal", polarity: "umbra", quantity: 3 },
        ],
      },
      { subject: "Archwings:Odonata", polarities: [] },
    ],
  );
});

test("wiki Warframe adapter fails when a required equipment group disappears", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiWarframesAdapter(),
      wikiSnapshot(`
        return {
          Warframes = {
            Ash = { MaxRank = 30, Name = "Ash", Polarities = {}, Type = "Warframe" },
          },
        }
      `),
    ),
    /has no Archwings table/,
  );
});

test("wiki Warframe adapter rejects invalid ranked records", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiWarframesAdapter(),
      wikiSnapshot(`
        return {
          Warframes = {
            Ash = { MaxRank = 29, Name = "Ash", Type = "Warframe" },
          },
          Archwings = {
            Odonata = { MaxRank = 30, Name = "Odonata", Type = "Archwing" },
          },
        }
      `),
    ),
    /Warframes record Ash has invalid MaxRank/,
  );
});

function wikiSnapshot(content: string): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      query: {
        pages: [
          {
            title: "Module:Warframes/data",
            revisions: [
              {
                revid: 42,
                slots: { main: { content } },
              },
            ],
          },
        ],
      },
    }),
  );
  return {
    sourceId: "warframe-wiki-warframes",
    version: "fixture-1",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
