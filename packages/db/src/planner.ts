import type Database from "better-sqlite3";
import {
  expandMissingRequirements,
  recommendNodes,
  type DropSource,
  type EntityId,
  type InventoryEntry,
  type Recipe,
} from "@ordis-prime/domain";
import { listCurrentWorldState } from "./world-state.ts";

export interface PlayerGoal {
  entityId: string;
  kind: string;
  slug: string;
  name: string;
  targetQuantity: number;
}

export interface AcquisitionPlan {
  goals: PlayerGoal[];
  missing: Array<{
    entityId: string;
    kind: string;
    slug: string;
    name: string;
    quantity: number;
  }>;
  recommendations: Array<{
    nodeId?: string;
    nodeSlug?: string;
    locationLabel: string;
    neededRewards: Array<{
      entityId: string;
      kind: string;
      slug: string;
      name: string;
      quantity: number;
      chance?: number;
      rotation?: string;
    }>;
    reasons: string[];
    accessStatus: "available" | "blocked" | "unknown";
    accessRequirements: Array<{
      entityId: string;
      kind: string;
      slug: string;
      name: string;
      state: "unseen" | "discovered" | "completed";
      relationKinds: Array<"requires" | "unlocks">;
      sources: Array<{ name: string; citationUrl?: string }>;
    }>;
  }>;
  recipeChoices: Array<{
    output: { entityId: string; kind: string; slug: string; name: string };
    preferredAvailable: boolean;
    options: Array<{
      recipeId: string;
      sourceId: string;
      sourceName: string;
      sourceRecordKey?: string;
      selected: boolean;
      outputQuantity: number;
      ingredients: Array<{
        entityId: string;
        kind: string;
        slug: string;
        name: string;
        quantity: number;
      }>;
    }>;
  }>;
}

export interface LiveAcquisitionOpportunity {
  externalId: string;
  kind: string;
  label: string;
  nodeSlug: string;
  nodeLabel: string;
  activation?: number;
  expiry?: number;
  status: "active" | "upcoming";
  neededRewards: AcquisitionPlan["recommendations"][number]["neededRewards"];
}

export function setPlayerGoal(
  sqlite: Database.Database,
  userId: string,
  reference: { kind: string; slug: string },
  targetQuantity: number,
): void {
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0)
    throw new Error("Goal quantity must be a non-negative safe integer");
  assertUser(sqlite, userId);
  const entity = sqlite
    .prepare(
      "select id from entities where kind = ? and slug = ? and retired = 0",
    )
    .get(reference.kind, reference.slug) as { id: string } | undefined;
  if (!entity)
    throw new Error(
      `Unknown active entity ${reference.kind}:${reference.slug}`,
    );
  if (targetQuantity === 0) {
    sqlite
      .prepare("delete from player_goals where user_id = ? and entity_id = ?")
      .run(userId, entity.id);
    return;
  }
  const now = Date.now();
  sqlite
    .prepare(
      `
    insert into player_goals (user_id, entity_id, target_quantity, created_at, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(user_id, entity_id) do update set target_quantity = excluded.target_quantity, updated_at = excluded.updated_at
  `,
    )
    .run(userId, entity.id, targetQuantity, now, now);
}

export function listPlayerGoals(
  sqlite: Database.Database,
  userId: string,
): PlayerGoal[] {
  assertUser(sqlite, userId);
  return sqlite
    .prepare(
      `
    select goal.entity_id as entityId, entity.kind, entity.slug, entity.name, goal.target_quantity as targetQuantity
    from player_goals goal
    join entities entity on entity.id = goal.entity_id
    where goal.user_id = ? and entity.retired = 0
    order by entity.name collate nocase, entity.kind
  `,
    )
    .all(userId) as PlayerGoal[];
}

export function setPlayerRecipePreference(
  sqlite: Database.Database,
  userId: string,
  output: { kind: string; slug: string },
  recipeId?: string,
): void {
  assertUser(sqlite, userId);
  const outputEntity = sqlite
    .prepare(
      "select id from entities where kind = ? and slug = ? and retired = 0",
    )
    .get(output.kind, output.slug) as { id: string } | undefined;
  if (!outputEntity)
    throw new Error(`Unknown active entity ${output.kind}:${output.slug}`);
  if (!recipeId) {
    sqlite
      .prepare(
        "delete from player_recipe_preferences where user_id = ? and output_entity_id = ?",
      )
      .run(userId, outputEntity.id);
    return;
  }
  const recipe = sqlite
    .prepare(
      `
    select run.source_id as sourceId, recipe.source_record_key as sourceRecordKey
    from recipes recipe join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
    where recipe.id = ? and recipe.output_id = ?
  `,
    )
    .get(recipeId, outputEntity.id) as
    { sourceId: string; sourceRecordKey: string | null } | undefined;
  if (!recipe)
    throw new Error("Recipe alternative is not active for this output");
  if (!recipe.sourceRecordKey)
    throw new Error("Recipe alternative has no stable source record key");
  const now = Date.now();
  sqlite
    .prepare(
      `
    insert into player_recipe_preferences (user_id, output_entity_id, source_id, source_record_key, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?)
    on conflict(user_id, output_entity_id) do update set source_id = excluded.source_id,
      source_record_key = excluded.source_record_key, updated_at = excluded.updated_at
  `,
    )
    .run(
      userId,
      outputEntity.id,
      recipe.sourceId,
      recipe.sourceRecordKey,
      now,
      now,
    );
}

export function buildAcquisitionPlan(
  sqlite: Database.Database,
  userId: string,
): AcquisitionPlan {
  const goals = listPlayerGoals(sqlite, userId);
  const inventoryRows = sqlite
    .prepare(
      `
    select entity_id as entityId, owned_count as ownedCount, built_count as builtCount,
           wanted_count as wantedCount, mastered, subsumed
    from player_inventory where user_id = ?
  `,
    )
    .all(userId) as Array<{
    entityId: string;
    ownedCount: number;
    builtCount: number;
    wantedCount: number;
    mastered: number | null;
    subsumed: number | null;
  }>;
  const inventory: InventoryEntry[] = inventoryRows.map((row) => ({
    entityId: row.entityId as EntityId,
    ownedCount: row.ownedCount,
    builtCount: row.builtCount,
    wantedCount: row.wantedCount,
    mastered: row.mastered === null ? undefined : Boolean(row.mastered),
    subsumed: row.subsumed === null ? undefined : Boolean(row.subsumed),
  }));
  const recipeRows = sqlite
    .prepare(
      `
    select recipe.id, recipe.output_id as outputId, recipe.output_quantity as outputQuantity,
           recipe.source_record_key as sourceRecordKey, run.source_id as sourceId,
           source.name as sourceName, ingredient.entity_id as entityId, ingredient.quantity
    from recipes recipe
    join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    join recipe_ingredients ingredient on ingredient.recipe_id = recipe.id
    order by recipe.output_id, source.priority desc, run.retrieved_at desc, recipe.id, ingredient.entity_id
  `,
    )
    .all() as Array<{
    id: string;
    outputId: string;
    outputQuantity: number;
    sourceId: string;
    sourceName: string;
    sourceRecordKey: string | null;
    entityId: string;
    quantity: number;
  }>;
  type RecipeOption = Recipe & {
    id: string;
    sourceId: string;
    sourceName: string;
    sourceRecordKey?: string;
  };
  const recipesById = new Map<string, RecipeOption>();
  for (const row of recipeRows) {
    const recipe = recipesById.get(row.id) ?? {
      id: row.id,
      outputId: row.outputId as EntityId,
      outputQuantity: row.outputQuantity,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      sourceRecordKey: row.sourceRecordKey ?? undefined,
      ingredients: [],
    };
    recipe.ingredients.push({
      entityId: row.entityId as EntityId,
      quantity: row.quantity,
    });
    recipesById.set(row.id, recipe);
  }
  const preferences = new Map(
    (
      sqlite
        .prepare(
          "select output_entity_id as outputId, source_id as sourceId, source_record_key as sourceRecordKey from player_recipe_preferences where user_id = ?",
        )
        .all(userId) as Array<{
        outputId: string;
        sourceId: string;
        sourceRecordKey: string;
      }>
    ).map((entry) => [entry.outputId, entry]),
  );
  const recipeGroups = new Map<string, RecipeOption[]>();
  for (const recipe of recipesById.values())
    recipeGroups.set(recipe.outputId, [
      ...(recipeGroups.get(recipe.outputId) ?? []),
      recipe,
    ]);
  const selectedRecipes: Recipe[] = [];
  const selectedIds = new Set<string>();
  const preferredAvailability = new Map<string, boolean>();
  for (const [outputId, options] of recipeGroups) {
    const preference = preferences.get(outputId);
    const preferred = preference
      ? options.find(
          (option) =>
            option.sourceId === preference.sourceId &&
            option.sourceRecordKey === preference.sourceRecordKey,
        )
      : undefined;
    const selected = preferred ?? options[0]!;
    selectedRecipes.push(selected);
    selectedIds.add(selected.id);
    preferredAvailability.set(outputId, !preference || Boolean(preferred));
  }
  const drops = sqlite
    .prepare(
      `
    select item_drop.reward_id as rewardId, item_drop.node_id as nodeId, item_drop.location_label as locationLabel,
           item_drop.chance, item_drop.rotation, item_drop.quantity
    from drops item_drop
    join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
    order by item_drop.location_label, item_drop.id
  `,
    )
    .all()
    .map((row) => {
      const value = row as {
        rewardId: string;
        nodeId: string | null;
        locationLabel: string;
        chance: number | null;
        rotation: string | null;
        quantity: number;
      };
      return {
        rewardId: value.rewardId as EntityId,
        nodeId: value.nodeId ? (value.nodeId as EntityId) : undefined,
        locationLabel: value.locationLabel,
        chance: value.chance ?? undefined,
        rotation: value.rotation ?? undefined,
        quantity: value.quantity,
      };
    }) as DropSource[];
  const missingRequirements = expandMissingRequirements(
    goals.map((goal) => ({
      entityId: goal.entityId as EntityId,
      quantity: goal.targetQuantity,
    })),
    inventory,
    selectedRecipes,
  );
  const entityIds = new Set([
    ...missingRequirements.map((entry) => entry.entityId),
    ...(drops.map((drop) => drop.nodeId).filter(Boolean) as EntityId[]),
    ...(recipeGroups.keys() as Iterable<EntityId>),
    ...recipeRows.map((row) => row.entityId as EntityId),
  ]);
  const entities = loadEntityNames(sqlite, entityIds);
  const missing = missingRequirements.map((entry) => ({
    ...entityDetails(entities, entry.entityId),
    entityId: entry.entityId,
    quantity: entry.quantity,
  }));
  const recommendedNodes = recommendNodes(missingRequirements, drops);
  const nodeAccess = loadNodeAccess(
    sqlite,
    userId,
    new Set(recommendedNodes.flatMap(({ nodeId }) => (nodeId ? [nodeId] : []))),
  );
  const recommendations = recommendedNodes
    .map((recommendation) => {
      const node = recommendation.nodeId
        ? entities.get(recommendation.nodeId)
        : undefined;
      const accessRequirements = recommendation.nodeId
        ? (nodeAccess.get(recommendation.nodeId) ?? [])
        : [];
      const neededRewards = recommendation.neededRewards.map((reward) => ({
        ...entityDetails(entities, reward.entityId),
        entityId: reward.entityId,
        quantity: reward.quantity,
        chance: reward.chance,
        rotation: reward.rotation,
      }));
      return {
        nodeId: recommendation.nodeId,
        nodeSlug: node?.slug,
        locationLabel: recommendation.locationLabel,
        neededRewards,
        accessStatus:
          accessRequirements.length === 0
            ? ("unknown" as const)
            : accessRequirements.every(({ state }) => state === "completed")
              ? ("available" as const)
              : ("blocked" as const),
        accessRequirements,
        reasons: [
          `Drops ${neededRewards.length} missing goal ${neededRewards.length === 1 ? "item" : "items"}`,
          ...neededRewards.map(
            (reward) =>
              `${reward.name}: need ${reward.quantity}${reward.chance === undefined ? "" : `, ${(reward.chance * 100).toFixed(2)}% documented chance`}${reward.rotation ? `, rotation ${reward.rotation}` : ""}`,
          ),
        ],
      };
    })
    .sort(
      (left, right) =>
        accessRank(left.accessStatus) - accessRank(right.accessStatus),
    );
  const plannedOutputs = new Set<string>([
    ...goals.map(({ entityId }) => entityId),
    ...missingRequirements.flatMap(({ via }) => via),
  ]);
  const recipeChoices = [...recipeGroups.entries()]
    .filter(
      ([outputId, options]) =>
        options.length > 1 && plannedOutputs.has(outputId),
    )
    .map(([outputId, options]) => ({
      output: { entityId: outputId, ...entityDetails(entities, outputId) },
      preferredAvailable: preferredAvailability.get(outputId) ?? true,
      options: options.map((option) => ({
        recipeId: option.id,
        sourceId: option.sourceId,
        sourceName: option.sourceName,
        sourceRecordKey: option.sourceRecordKey,
        selected: selectedIds.has(option.id),
        outputQuantity: option.outputQuantity,
        ingredients: option.ingredients.map((ingredient) => ({
          entityId: ingredient.entityId,
          ...entityDetails(entities, ingredient.entityId),
          quantity: ingredient.quantity,
        })),
      })),
    }));
  return { goals, missing, recommendations, recipeChoices };
}

function loadNodeAccess(
  sqlite: Database.Database,
  userId: string,
  nodeIds: Set<EntityId>,
): Map<
  string,
  AcquisitionPlan["recommendations"][number]["accessRequirements"]
> {
  const result = new Map<
    string,
    AcquisitionPlan["recommendations"][number]["accessRequirements"]
  >();
  if (nodeIds.size === 0) return result;
  const ids = [...nodeIds];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `
    select relation.from_entity_id as nodeId, prerequisite.id as entityId, prerequisite.kind, prerequisite.slug, prerequisite.name,
      'requires' as relationKind, source.name as sourceName, relation.citation_url as citationUrl,
      coalesce(progress.state, 'unseen') as state
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    join entities prerequisite on prerequisite.id = relation.to_entity_id and prerequisite.retired = 0
    left join player_discovery_progress progress on progress.entity_id = prerequisite.id and progress.user_id = ?
    where relation.kind = 'requires' and relation.from_entity_id in (${placeholders})
      and prerequisite.kind in ('quest', 'mechanic', 'secret', 'enemy', 'boss')
    union all
    select relation.to_entity_id, prerequisite.id, prerequisite.kind, prerequisite.slug, prerequisite.name,
      'unlocks', source.name, relation.citation_url, coalesce(progress.state, 'unseen')
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    join entities prerequisite on prerequisite.id = relation.from_entity_id and prerequisite.retired = 0
    left join player_discovery_progress progress on progress.entity_id = prerequisite.id and progress.user_id = ?
    where relation.kind = 'unlocks' and relation.to_entity_id in (${placeholders})
      and prerequisite.kind in ('quest', 'mechanic', 'secret', 'enemy', 'boss')
    order by 1, 5, 2, 6, 7
  `,
    )
    .all(userId, ...ids, userId, ...ids) as Array<{
    nodeId: string;
    entityId: string;
    kind: string;
    slug: string;
    name: string;
    relationKind: "requires" | "unlocks";
    sourceName: string;
    citationUrl: string | null;
    state: "unseen" | "discovered" | "completed";
  }>;
  const indexed = new Map<
    string,
    Map<
      string,
      AcquisitionPlan["recommendations"][number]["accessRequirements"][number]
    >
  >();
  for (const row of rows) {
    const requirements = indexed.get(row.nodeId) ?? new Map();
    const requirement: AcquisitionPlan["recommendations"][number]["accessRequirements"][number] =
      requirements.get(row.entityId) ?? {
        entityId: row.entityId,
        kind: row.kind,
        slug: row.slug,
        name: row.name,
        state: row.state,
        relationKinds: [],
        sources: [],
      };
    if (!requirement.relationKinds.includes(row.relationKind))
      requirement.relationKinds.push(row.relationKind);
    if (
      !requirement.sources.some(
        ({ name, citationUrl }) =>
          name === row.sourceName &&
          citationUrl === (row.citationUrl ?? undefined),
      )
    ) {
      requirement.sources.push({
        name: row.sourceName,
        citationUrl: row.citationUrl ?? undefined,
      });
    }
    requirements.set(row.entityId, requirement);
    indexed.set(row.nodeId, requirements);
  }
  for (const [nodeId, requirements] of indexed)
    result.set(nodeId, [...requirements.values()]);
  return result;
}

function accessRank(
  status: AcquisitionPlan["recommendations"][number]["accessStatus"],
): number {
  return status === "available" ? 0 : status === "unknown" ? 1 : 2;
}

export function findLiveAcquisitionOpportunities(
  sqlite: Database.Database,
  plan: AcquisitionPlan,
  now = Date.now(),
): LiveAcquisitionOpportunity[] {
  const recommendations = new Map(
    plan.recommendations
      .filter((entry) => entry.nodeSlug)
      .map((entry) => [entry.nodeSlug!, entry]),
  );
  return listCurrentWorldState(sqlite, now).flatMap((window) => {
    if (!window.node) return [];
    const recommendation = recommendations.get(window.node.slug);
    if (!recommendation) return [];
    return [
      {
        externalId: window.externalId,
        kind: window.kind,
        label: window.label,
        nodeSlug: window.node.slug,
        nodeLabel: window.nodeLabel ?? window.node.name,
        activation: window.activation,
        expiry: window.expiry,
        status:
          window.activation !== undefined && window.activation > now
            ? ("upcoming" as const)
            : ("active" as const),
        neededRewards: recommendation.neededRewards,
      },
    ];
  });
}

function loadEntityNames(sqlite: Database.Database, ids: Set<EntityId>) {
  const result = new Map<
    string,
    { kind: string; slug: string; name: string }
  >();
  const statement = sqlite.prepare(
    "select kind, slug, name from entities where id = ?",
  );
  for (const id of ids) {
    const entity = statement.get(id) as
      { kind: string; slug: string; name: string } | undefined;
    if (entity) result.set(id, entity);
  }
  return result;
}

function entityDetails(
  entities: Map<string, { kind: string; slug: string; name: string }>,
  id: string,
) {
  const entity = entities.get(id);
  if (!entity) throw new Error(`Planner references unknown entity ${id}`);
  return entity;
}

function assertUser(sqlite: Database.Database, userId: string) {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId))
    throw new Error(`Unknown user ${userId}`);
}
