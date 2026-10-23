import type {
  AdversaryKind,
  DropSource,
  EntityId,
  InventoryEntry,
  PlayerActiveAdversary,
  Recipe,
} from "./model.ts";

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

export type NodeAccessStatus =
  "available" | "conditional" | "blocked" | "unknown";

export function deriveNodeAccessStatus(input: {
  requirementStates: Array<
    "unseen" | "discovered" | "incomplete" | "completed" | undefined
  >;
  masteryRequirement?: number;
  playerRank?: number;
  railjackIntrinsicRequirement?: number;
  playerRailjackIntrinsicRank?: number;
  warframeRankRequirement?: number;
  playerHighestWarframeRank?: number;
  itemRequirementStates?: Array<"met" | "blocked" | undefined>;
  objectiveStates?: Array<"incomplete" | "completed" | undefined>;
  activeAdversaryRequirement?: AdversaryKind;
  playerActiveAdversary?: PlayerActiveAdversary;
}): NodeAccessStatus {
  if (
    input.requirementStates.some(
      (state) => state !== undefined && state !== "completed",
    ) ||
    (input.masteryRequirement !== undefined &&
      input.playerRank !== undefined &&
      input.playerRank < input.masteryRequirement) ||
    (input.railjackIntrinsicRequirement !== undefined &&
      input.playerRailjackIntrinsicRank !== undefined &&
      input.playerRailjackIntrinsicRank < input.railjackIntrinsicRequirement) ||
    (input.warframeRankRequirement !== undefined &&
      input.playerHighestWarframeRank !== undefined &&
      input.playerHighestWarframeRank < input.warframeRankRequirement) ||
    input.itemRequirementStates?.some((state) => state === "blocked") ||
    input.objectiveStates?.some((state) => state === "incomplete") ||
    (input.activeAdversaryRequirement !== undefined &&
      input.playerActiveAdversary !== undefined &&
      input.playerActiveAdversary !== input.activeAdversaryRequirement)
  )
    return "blocked";
  if (
    input.requirementStates.some((state) => state === undefined) ||
    (input.masteryRequirement !== undefined &&
      input.playerRank === undefined) ||
    (input.railjackIntrinsicRequirement !== undefined &&
      input.playerRailjackIntrinsicRank === undefined) ||
    (input.warframeRankRequirement !== undefined &&
      input.playerHighestWarframeRank === undefined) ||
    input.itemRequirementStates?.some((state) => state === undefined) ||
    input.objectiveStates?.some((state) => state === undefined) ||
    (input.activeAdversaryRequirement !== undefined &&
      input.playerActiveAdversary === undefined)
  )
    return "conditional";
  if (
    input.requirementStates.length ||
    input.masteryRequirement !== undefined ||
    input.railjackIntrinsicRequirement !== undefined ||
    input.warframeRankRequirement !== undefined ||
    Boolean(input.itemRequirementStates?.length) ||
    Boolean(input.objectiveStates?.length) ||
    input.activeAdversaryRequirement !== undefined
  )
    return "available";
  return "unknown";
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
    const reward = {
      entityId: drop.rewardId,
      quantity,
      chance: drop.chance,
      rotation: drop.rotation,
    };
    const alreadyIncluded = recommendation.neededRewards.some(
      (candidate) =>
        candidate.entityId === reward.entityId &&
        candidate.chance === reward.chance &&
        candidate.rotation === reward.rotation,
    );
    if (!alreadyIncluded) recommendation.neededRewards.push(reward);
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
