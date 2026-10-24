import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WfcdItemsAdapter,
  type Snapshot,
} from "../src/index.ts";

test("WFCD relic variants retain exact refinement reward probabilities", async () => {
  const rewards = (chances: number[]) =>
    chances.map((chance, index) => ({
      chance,
      rarity: index === 0 ? "Rare" : index < 3 ? "Uncommon" : "Common",
      item: {
        name: index === 0 ? "Test Prime Blueprint" : `Test Prime Part ${index}`,
        uniqueName: `/Lotus/Test/Reward${index}`,
        warframeMarket: {
          id: `market-${index}`,
          urlName: `test_reward_${index}`,
        },
      },
    }));
  const variants = [
    ["Intact", "Bronze", [2, 11, 11, 25.33, 25.33, 25.34]],
    ["Exceptional", "Silver", [4, 13, 13, 23.33, 23.33, 23.34]],
    ["Flawless", "Gold", [6, 17, 17, 20, 20, 20]],
    ["Radiant", "Platinum", [10, 20, 20, 16.67, 16.67, 16.66]],
  ] as const;
  const data = [
    {
      uniqueName: "/Lotus/Test/RelicA",
      name: "Lith T1 Relic",
      category: "Relics",
      type: "Relic",
      vaulted: false,
    },
    ...variants.map(([name, suffix, chances]) => ({
      uniqueName: `/Lotus/Test/RelicA${suffix}`,
      name: `Lith T1 ${name}`,
      category: "Relics",
      type: "Relic",
      rewards: rewards([...chances]),
    })),
    {
      uniqueName: "/Lotus/Test/RelicReissueBronze",
      name: "Lith T1 Intact",
      category: "Relics",
      type: "Relic",
      rewards: rewards([2, 11, 11, 25.33, 25.33, 25.34]),
    },
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const snapshot: Snapshot = {
    sourceId: "wfcd-items",
    version: "fixture",
    retrievedAt: "2026-10-24T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
  const observations = await collect(new WfcdItemsAdapter(), snapshot);
  const relicRewards = observations.filter(
    (observation) => observation.type === "relic-reward",
  );
  assert.equal(relicRewards.length, 24);
  const baseRelicDeclarations = observations.filter(
    (
      observation,
    ): observation is Extract<
      (typeof observations)[number],
      { type: "entity" }
    > => observation.type === "entity" && observation.kind === "relic",
  );
  assert.ok(
    baseRelicDeclarations.every(
      (observation) => observation.fields.name === "Lith T1 Relic",
    ),
  );
  const radiant = relicRewards
    .filter(
      (observation) =>
        observation.type === "relic-reward" &&
        observation.refinement === "radiant",
    )
    .map((observation) =>
      observation.type === "relic-reward" ? observation.chance : 0,
    );
  assert.deepEqual(radiant.slice(0, 3), [0.1, 0.2, 0.2]);
  assert.ok(
    Math.abs(radiant.reduce((sum, chance) => sum + chance, 0) - 1) < 0.00001,
  );
});
