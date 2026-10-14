import type Database from "better-sqlite3";
import { expandMissingRequirements, recommendNodes, type DropSource, type EntityId, type InventoryEntry, type Recipe } from "@ordis-prime/domain";
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
  missing: Array<{ entityId: string; kind: string; slug: string; name: string; quantity: number }>;
  recommendations: Array<{
    nodeId?: string;
    nodeSlug?: string;
    locationLabel: string;
    neededRewards: Array<{ entityId: string; kind: string; slug: string; name: string; quantity: number; chance?: number; rotation?: string }>;
    reasons: string[];
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
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0) throw new Error("Goal quantity must be a non-negative safe integer");
  assertUser(sqlite, userId);
  const entity = sqlite.prepare("select id from entities where kind = ? and slug = ? and retired = 0")
    .get(reference.kind, reference.slug) as { id: string } | undefined;
  if (!entity) throw new Error(`Unknown active entity ${reference.kind}:${reference.slug}`);
  if (targetQuantity === 0) {
    sqlite.prepare("delete from player_goals where user_id = ? and entity_id = ?").run(userId, entity.id);
    return;
  }
  const now = Date.now();
  sqlite.prepare(`
    insert into player_goals (user_id, entity_id, target_quantity, created_at, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(user_id, entity_id) do update set target_quantity = excluded.target_quantity, updated_at = excluded.updated_at
  `).run(userId, entity.id, targetQuantity, now, now);
}

export function listPlayerGoals(sqlite: Database.Database, userId: string): PlayerGoal[] {
  assertUser(sqlite, userId);
  return sqlite.prepare(`
    select goal.entity_id as entityId, entity.kind, entity.slug, entity.name, goal.target_quantity as targetQuantity
    from player_goals goal
    join entities entity on entity.id = goal.entity_id
    where goal.user_id = ? and entity.retired = 0
    order by entity.name collate nocase, entity.kind
  `).all(userId) as PlayerGoal[];
}

export function buildAcquisitionPlan(sqlite: Database.Database, userId: string): AcquisitionPlan {
  const goals = listPlayerGoals(sqlite, userId);
  const inventoryRows = sqlite.prepare(`
    select entity_id as entityId, owned_count as ownedCount, built_count as builtCount,
           wanted_count as wantedCount, mastered, subsumed
    from player_inventory where user_id = ?
  `).all(userId) as Array<{ entityId: string; ownedCount: number; builtCount: number; wantedCount: number; mastered: number | null; subsumed: number | null }>;
  const inventory: InventoryEntry[] = inventoryRows.map((row) => ({
    entityId: row.entityId as EntityId,
    ownedCount: row.ownedCount,
    builtCount: row.builtCount,
    wantedCount: row.wantedCount,
    mastered: row.mastered === null ? undefined : Boolean(row.mastered),
    subsumed: row.subsumed === null ? undefined : Boolean(row.subsumed),
  }));
  const recipeRows = sqlite.prepare(`
    with selected_recipes as (
      select recipe.*, row_number() over (
        partition by recipe.output_id order by source.priority desc, run.retrieved_at desc, recipe.id
      ) as preference
      from recipes recipe
      join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
      join sources source on source.id = run.source_id
    )
    select recipe.id, recipe.output_id as outputId, recipe.output_quantity as outputQuantity,
           ingredient.entity_id as entityId, ingredient.quantity
    from selected_recipes recipe
    join recipe_ingredients ingredient on ingredient.recipe_id = recipe.id
    where recipe.preference = 1
    order by recipe.id, ingredient.entity_id
  `).all() as Array<{ id: string; outputId: string; outputQuantity: number; entityId: string; quantity: number }>;
  const recipesById = new Map<string, Recipe>();
  for (const row of recipeRows) {
    const recipe = recipesById.get(row.id) ?? { outputId: row.outputId as EntityId, outputQuantity: row.outputQuantity, ingredients: [] };
    recipe.ingredients.push({ entityId: row.entityId as EntityId, quantity: row.quantity });
    recipesById.set(row.id, recipe);
  }
  const drops = sqlite.prepare(`
    select item_drop.reward_id as rewardId, item_drop.node_id as nodeId, item_drop.location_label as locationLabel,
           item_drop.chance, item_drop.rotation, item_drop.quantity
    from drops item_drop
    join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
    order by item_drop.location_label, item_drop.id
  `).all().map((row) => {
    const value = row as { rewardId: string; nodeId: string | null; locationLabel: string; chance: number | null; rotation: string | null; quantity: number };
    return { rewardId: value.rewardId as EntityId, nodeId: value.nodeId ? value.nodeId as EntityId : undefined, locationLabel: value.locationLabel, chance: value.chance ?? undefined, rotation: value.rotation ?? undefined, quantity: value.quantity };
  }) as DropSource[];
  const missingRequirements = expandMissingRequirements(
    goals.map((goal) => ({ entityId: goal.entityId as EntityId, quantity: goal.targetQuantity })),
    inventory,
    [...recipesById.values()],
  );
  const entityIds = new Set([...missingRequirements.map((entry) => entry.entityId), ...drops.map((drop) => drop.nodeId).filter(Boolean) as EntityId[]]);
  const entities = loadEntityNames(sqlite, entityIds);
  const missing = missingRequirements.map((entry) => ({ ...entityDetails(entities, entry.entityId), entityId: entry.entityId, quantity: entry.quantity }));
  const recommendations = recommendNodes(missingRequirements, drops).map((recommendation) => {
    const node = recommendation.nodeId ? entities.get(recommendation.nodeId) : undefined;
    const neededRewards = recommendation.neededRewards.map((reward) => ({
      ...entityDetails(entities, reward.entityId), entityId: reward.entityId, quantity: reward.quantity,
      chance: reward.chance, rotation: reward.rotation,
    }));
    return {
      nodeId: recommendation.nodeId,
      nodeSlug: node?.slug,
      locationLabel: recommendation.locationLabel,
      neededRewards,
      reasons: [
        `Drops ${neededRewards.length} missing goal ${neededRewards.length === 1 ? "item" : "items"}`,
        ...neededRewards.map((reward) => `${reward.name}: need ${reward.quantity}${reward.chance === undefined ? "" : `, ${(reward.chance * 100).toFixed(2)}% documented chance`}${reward.rotation ? `, rotation ${reward.rotation}` : ""}`),
      ],
    };
  });
  return { goals, missing, recommendations };
}

export function findLiveAcquisitionOpportunities(sqlite: Database.Database, plan: AcquisitionPlan, now = Date.now()): LiveAcquisitionOpportunity[] {
  const recommendations = new Map(plan.recommendations.filter((entry) => entry.nodeSlug).map((entry) => [entry.nodeSlug!, entry]));
  return listCurrentWorldState(sqlite, now).flatMap((window) => {
    if (!window.node) return [];
    const recommendation = recommendations.get(window.node.slug);
    if (!recommendation) return [];
    return [{
      externalId: window.externalId, kind: window.kind, label: window.label,
      nodeSlug: window.node.slug, nodeLabel: window.nodeLabel ?? window.node.name,
      activation: window.activation, expiry: window.expiry,
      status: window.activation !== undefined && window.activation > now ? "upcoming" as const : "active" as const,
      neededRewards: recommendation.neededRewards,
    }];
  });
}

function loadEntityNames(sqlite: Database.Database, ids: Set<EntityId>) {
  const result = new Map<string, { kind: string; slug: string; name: string }>();
  const statement = sqlite.prepare("select kind, slug, name from entities where id = ?");
  for (const id of ids) {
    const entity = statement.get(id) as { kind: string; slug: string; name: string } | undefined;
    if (entity) result.set(id, entity);
  }
  return result;
}

function entityDetails(entities: Map<string, { kind: string; slug: string; name: string }>, id: string) {
  const entity = entities.get(id);
  if (!entity) throw new Error(`Planner references unknown entity ${id}`);
  return entity;
}

function assertUser(sqlite: Database.Database, userId: string) {
  if (!sqlite.prepare("select 1 from users where id = ?").get(userId)) throw new Error(`Unknown user ${userId}`);
}
