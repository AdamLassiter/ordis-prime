import type { DropSource, EntityId, InventoryEntry, Recipe } from "./model.ts";

export interface MissingRequirement {
  entityId: EntityId;
  quantity: number;
  via: EntityId[];
}
export interface NodeRecommendation {
  nodeId?: EntityId;
  locationLabel: string;
  neededRewards: Array<{
    entityId: EntityId;
    quantity: number;
    chance?: number;
    rotation?: string;
  }>;
  reasons: string[];
}

export function expandMissingRequirements(
  goals: Array<{ entityId: EntityId; quantity: number }>,
  inventory: readonly InventoryEntry[],
  recipes: readonly Recipe[],
): MissingRequirement[] {
  const remainingOwned = new Map(
    inventory.map((entry) => [
      entry.entityId,
      entry.ownedCount + entry.builtCount,
    ]),
  );
  const recipeByOutput = new Map(
    recipes.map((recipe) => [recipe.outputId, recipe]),
  );
  const missing = new Map<EntityId, MissingRequirement>();

  function visit(entityId: EntityId, quantity: number, via: EntityId[]): void {
    const available = remainingOwned.get(entityId) ?? 0;
    const consumed = Math.min(quantity, available);
    remainingOwned.set(entityId, available - consumed);
    const remaining = quantity - consumed;
    if (!remaining) return;
    if (via.includes(entityId))
      throw new Error(`Recipe cycle detected at ${entityId}`);
    const recipe = recipeByOutput.get(entityId);
    if (!recipe) {
      const current = missing.get(entityId);
      missing.set(entityId, {
        entityId,
        quantity: (current?.quantity ?? 0) + remaining,
        via,
      });
      return;
    }
    const crafts = Math.ceil(remaining / recipe.outputQuantity);
    for (const ingredient of recipe.ingredients) {
      visit(ingredient.entityId, ingredient.quantity * crafts, [
        ...via,
        entityId,
      ]);
    }
  }
  for (const goal of goals) visit(goal.entityId, goal.quantity, []);
  return [...missing.values()].sort((a, b) =>
    a.entityId.localeCompare(b.entityId),
  );
}

export function recommendNodes(
  missing: readonly MissingRequirement[],
  drops: readonly DropSource[],
): NodeRecommendation[] {
  const need = new Map(
    missing.map((entry) => [entry.entityId, entry.quantity]),
  );
  const grouped = new Map<string, NodeRecommendation>();
  for (const drop of drops) {
    const quantity = need.get(drop.rewardId);
    if (!quantity) continue;
    const key = drop.nodeId ?? `label:${drop.locationLabel}`;
    const recommendation = grouped.get(key) ?? {
      nodeId: drop.nodeId,
      locationLabel: drop.locationLabel,
      neededRewards: [],
      reasons: [],
    };
    recommendation.neededRewards.push({
      entityId: drop.rewardId,
      quantity,
      chance: drop.chance,
      rotation: drop.rotation,
    });
    grouped.set(key, recommendation);
  }
  for (const recommendation of grouped.values()) {
    recommendation.reasons = [
      `Drops ${recommendation.neededRewards.length} missing goal ${recommendation.neededRewards.length === 1 ? "item" : "items"}`,
      ...recommendation.neededRewards.map(
        (reward) =>
          `${reward.entityId}: need ${reward.quantity}${reward.chance == null ? "" : `, ${(reward.chance * 100).toFixed(2)}% documented chance`}${reward.rotation ? `, rotation ${reward.rotation}` : ""}`,
      ),
    ];
  }
  return [...grouped.values()].sort(
    (a, b) =>
      b.neededRewards.length - a.neededRewards.length ||
      a.locationLabel.localeCompare(b.locationLabel),
  );
}
