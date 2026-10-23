import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiAbilitiesAdapter,
  type Snapshot,
} from "../src/index.ts";

test("wiki ability adapter imports current abilities and typed powersuit links", async () => {
  const observations = await collect(
    new WarframeWikiAbilitiesAdapter(),
    wikiSnapshot(
      `
        local AbilityData = {
          Archived = {
            SuperJump = { Name = "Super Jump", Powersuit = "Excalibur" },
          },
          Ability = {
            SlashDash = {
              Name = "Slash Dash",
              Description = "Dash between enemies while <DT_SLASH_COLOR>slashing them.",
              Powersuit = "Excalibur",
              Key = 1,
              Subsumable = true,
            },
            Blink = {
              Description = "Teleport a short distance.",
              Powersuit = "Itzal",
            },
            InfestedMobility = {
              Name = "Infested Mobility",
              Powersuit = "Helminth",
            },
          },
        }
        return AbilityData
      `,
      `
        return {
          Warframes = {
            Excalibur = { Name = "Excalibur", Type = "Warframe", Abilities = { "Slash Dash" } },
            ["Excalibur Prime"] = { Name = "Excalibur Prime", Type = "Warframe", Abilities = { "Slash Dash" } },
            Stalker = { Name = "Stalker", Type = "Warframe", _IgnoreEntry = true },
          },
          Archwings = {
            Itzal = { Name = "Itzal", Type = "Archwing" },
          },
        }
      `,
    ),
  );

  assert.deepEqual(
    observations
      .filter((observation) => observation.type === "entity")
      .map((observation) => ({
        kind: observation.kind,
        name: observation.fields.name,
        description: observation.fields.description,
      })),
    [
      { kind: "warframe", name: "Excalibur", description: undefined },
      { kind: "warframe", name: "Excalibur Prime", description: undefined },
      { kind: "archwing", name: "Itzal", description: undefined },
      {
        kind: "ability",
        name: "Slash Dash",
        description: "Dash between enemies while slashing them.",
      },
      {
        kind: "ability",
        name: "Blink",
        description: "Teleport a short distance.",
      },
      {
        kind: "ability",
        name: "Infested Mobility",
        description: undefined,
      },
    ],
  );
  assert.deepEqual(
    observations
      .filter((observation) => observation.type === "entity-relation")
      .map((observation) => ({
        from: observation.fromExternalId.value,
        to: observation.toExternalId.value,
        kind: observation.kind,
      })),
    [
      { from: "Excalibur", to: "SlashDash", kind: "involves" },
      { from: "Excalibur Prime", to: "SlashDash", kind: "involves" },
      { from: "Itzal", to: "Blink", kind: "involves" },
    ],
  );
  assert.deepEqual(
    observations.flatMap((observation) =>
      observation.type === "entity-attribute" &&
      observation.subjectExternalId.value === "SlashDash"
        ? [[observation.key, observation.value]]
        : [],
    ),
    [
      ["ability-slot", "1"],
      ["helminth-eligible", "true"],
    ],
  );
  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity" &&
        observation.fields.name === "Super Jump",
    ),
    false,
  );
});

test("wiki ability adapter requires the current ability table", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiAbilitiesAdapter(),
      wikiSnapshot(
        "return { Archived = {} }",
        "return { Warframes = {}, Archwings = {} }",
      ),
    ),
    /has no Ability table/,
  );
});

test("wiki ability adapter rejects a mistyped powersuit record", async () => {
  await assert.rejects(
    collect(
      new WarframeWikiAbilitiesAdapter(),
      wikiSnapshot(
        `
          return {
            Ability = {
              SlashDash = { Powersuit = "Excalibur" },
            },
          }
        `,
        `
          return {
            Warframes = {
              Excalibur = { Name = "Excalibur", Type = "Archwing" },
            },
            Archwings = {},
          }
        `,
      ),
    ),
    /Warframes record Excalibur has invalid Type/,
  );
});

test("wiki ability adapter links augment mods with sourced descriptions", async () => {
  const observations = await collect(
    new WarframeWikiAbilitiesAdapter(),
    wikiSnapshot(
      `return { Ability = { Chaos = {
        Name = "Chaos", Powersuit = "Nyx", Augments = { "Chaos Sphere" },
        Description = "Nyx disorients nearby enemies.",
      } } }`,
      `return { Warframes = { Nyx = { Name = "Nyx", Type = "Warframe" } }, Archwings = {} }`,
      `return { Mods = { ["Chaos Sphere"] = {
        Name = "Chaos Sphere", IsAbilityAugment = true,
        Description = "Chaos Augment: Enemies entering the Effect Range are affected.",
      } } }`,
    ),
  );

  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity" &&
        observation.kind === "mod" &&
        observation.fields.name === "Chaos Sphere" &&
        observation.fields.description ===
          "Chaos Augment: Enemies entering the Effect Range are affected.",
    ),
    true,
  );
  assert.equal(
    observations.some(
      (observation) =>
        observation.type === "entity-relation" &&
        observation.kind === "augments" &&
        observation.fromExternalId.value === "Chaos Sphere" &&
        observation.toExternalId.value === "Chaos",
    ),
    true,
  );
});

function wikiSnapshot(
  abilityContent: string,
  warframeContent: string,
  modContent = "return { Mods = {} }",
): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      query: {
        pages: [
          {
            title: "Module:Ability/data",
            revisions: [
              {
                revid: 81,
                slots: { main: { content: abilityContent } },
              },
            ],
          },
          {
            title: "Module:Warframes/data",
            revisions: [
              {
                revid: 42,
                slots: { main: { content: warframeContent } },
              },
            ],
          },
          {
            title: "Module:Mods/data",
            revisions: [
              {
                revid: 99,
                slots: { main: { content: modContent } },
              },
            ],
          },
        ],
      },
    }),
  );
  return {
    sourceId: "warframe-wiki-abilities",
    version: "fixture-1",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
