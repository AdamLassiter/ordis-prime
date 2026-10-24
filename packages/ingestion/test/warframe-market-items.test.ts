import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeMarketItemsAdapter,
  type Snapshot,
} from "../src/index.ts";

test("Warframe.market items bridge market slugs to game references", async () => {
  const data = [
    item("ash_prime_set", "/Lotus/Powersuits/Ninja/AshPrime", [
      "set",
      "prime",
      "warframe",
    ]),
    item(
      "continuity",
      "/Lotus/Upgrades/Mods/Warframe/AvatarAbilityDurationMod",
      ["mod", "rare"],
    ),
    item("braton_prime", "/Lotus/Weapons/Tenno/Rifle/Braton/BratonPrime", [
      "weapon",
      "primary",
    ]),
    item(
      "hinta_stabilizer",
      "/Lotus/Types/Friendly/Pets/ZanukaPets/ZanukaPetParts/ZanukaPetPartTailB",
      ["secondary", "hound"],
    ),
    ...[...Array(996).keys()].map((index) =>
      item(`resource_${index}`, `/Lotus/Resource/${index}`, ["misc"]),
    ),
  ];
  const observations = await collect(
    new WarframeMarketItemsAdapter(),
    snapshot(data),
  );
  assert.equal(
    observations.filter((observation) => observation.type === "entity").length,
    1_000,
  );
  assert.equal(
    observations.filter(
      (observation) =>
        observation.type === "entity-attribute" &&
        observation.key === "market-tags",
    ).length,
    1_000,
  );
  assert.deepEqual(
    observations
      .filter((observation) => observation.type === "entity")
      .slice(0, 4)
      .map((observation) =>
        observation.type === "entity"
          ? {
              kind: observation.kind,
              slug: observation.externalIds.find(
                ({ namespace }) => namespace === "item-slug",
              )?.value,
              gameRef: observation.externalIds.find(
                ({ sourceId }) => sourceId === "wfcd-items",
              )?.value,
            }
          : undefined,
      ),
    [
      {
        kind: "unknown",
        slug: "ash_prime_set",
        gameRef: "/Lotus/Powersuits/Ninja/AshPrime",
      },
      {
        kind: "mod",
        slug: "continuity",
        gameRef: "/Lotus/Upgrades/Mods/Warframe/AvatarAbilityDurationMod",
      },
      {
        kind: "weapon",
        slug: "braton_prime",
        gameRef: "/Lotus/Weapons/Tenno/Rifle/Braton/BratonPrime",
      },
      {
        kind: "resource",
        slug: "hinta_stabilizer",
        gameRef:
          "/Lotus/Types/Friendly/Pets/ZanukaPets/ZanukaPetParts/ZanukaPetPartTailB",
      },
    ],
  );
});

test("Warframe.market keeps a set distinct from an item sharing its game reference", async () => {
  const gameRef =
    "/Lotus/Types/Sentinels/SentinelPowersuits/PrismaShadePowerSuit";
  const data = [
    item("prisma_shade", gameRef, ["sentinel"]),
    item("prisma_shade_set", gameRef, ["sentinel", "set"]),
    ...[...Array(999).keys()].map((index) =>
      item(`other_${index}`, `/Lotus/Other/${index}`, ["misc"]),
    ),
  ];
  const observations = await collect(
    new WarframeMarketItemsAdapter(),
    snapshot(data),
  );
  const entities = observations.filter(
    (observation) => observation.type === "entity",
  );
  const shade = entities.find((observation) =>
    observation.externalIds.some(({ value }) => value === "prisma_shade"),
  );
  const set = entities.find((observation) =>
    observation.externalIds.some(({ value }) => value === "prisma_shade_set"),
  );
  assert.ok(
    shade?.externalIds.some(({ sourceId }) => sourceId === "wfcd-items"),
  );
  assert.ok(
    !set?.externalIds.some(({ sourceId }) => sourceId === "wfcd-items"),
  );
  assert.notEqual(shade?.fields.slug, set?.fields.slug);
});

function item(slug: string, gameRef: string, tags: string[]) {
  return {
    id: `id-${slug}`,
    slug,
    gameRef,
    tags,
    i18n: { en: { name: slug.replaceAll("_", " ") } },
  };
}

function snapshot(data: unknown[]): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ apiVersion: "fixture", data, error: null }),
  );
  return {
    sourceId: "warframe-market-items",
    version: "fixture",
    retrievedAt: "2026-10-23T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}
