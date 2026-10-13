import assert from "node:assert/strict";
import test from "node:test";
import { expandMissingRequirements, recommendNodes, type DropSource, type EntityId, type Recipe } from "../src/index.ts";

const id = (value: string) => value as EntityId;

test("expands recipes, subtracts inventory, and recommends explainable nodes", () => {
  const recipes: Recipe[] = [{
    outputId: id("warframe:ash"), outputQuantity: 1,
    ingredients: [{ entityId: id("part:systems"), quantity: 1 }, { entityId: id("part:chassis"), quantity: 1 }],
  }];
  const missing = expandMissingRequirements(
    [{ entityId: id("warframe:ash"), quantity: 1 }],
    [{ entityId: id("part:chassis"), ownedCount: 1, builtCount: 0, wantedCount: 0 }],
    recipes,
  );
  assert.deepEqual(missing.map(({ entityId, quantity }) => ({ entityId, quantity })), [{ entityId: "part:systems", quantity: 1 }]);
  const drops: DropSource[] = [{ rewardId: id("part:systems"), nodeId: id("node:venus-a"), locationLabel: "Venus/A", chance: 0.1, rotation: "A", quantity: 1 }];
  const recommendations = recommendNodes(missing, drops);
  assert.equal(recommendations[0]?.locationLabel, "Venus/A");
  assert.match(recommendations[0]?.reasons.join(" ") ?? "", /10\.00% documented chance/);
});

test("rejects cyclic recipes instead of recursing forever", () => {
  assert.throws(() => expandMissingRequirements(
    [{ entityId: id("a"), quantity: 1 }], [],
    [{ outputId: id("a"), outputQuantity: 1, ingredients: [{ entityId: id("b"), quantity: 1 }] },
     { outputId: id("b"), outputQuantity: 1, ingredients: [{ entityId: id("a"), quantity: 1 }] }],
  ), /Recipe cycle/);
});

test("consumes shared inventory only once across multiple goals", () => {
  const recipes: Recipe[] = [
    { outputId: id("item:a"), outputQuantity: 1, ingredients: [{ entityId: id("resource:shared"), quantity: 2 }] },
    { outputId: id("item:b"), outputQuantity: 1, ingredients: [{ entityId: id("resource:shared"), quantity: 2 }] },
  ];
  const missing = expandMissingRequirements(
    [{ entityId: id("item:a"), quantity: 1 }, { entityId: id("item:b"), quantity: 1 }],
    [{ entityId: id("resource:shared"), ownedCount: 3, builtCount: 0, wantedCount: 0 }],
    recipes,
  );
  assert.deepEqual(missing.map(({ entityId, quantity }) => ({ entityId, quantity })), [{ entityId: "resource:shared", quantity: 1 }]);
});
