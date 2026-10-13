import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  externalKey,
  normalizedAlias,
  resolveEntity,
  type CanonicalEntity,
  type EntityId,
  type EntityObservation,
  type Observation,
  type ResolutionState,
} from "@ordis-prime/domain";

export interface PromotionSource {
  id: string;
  name: string;
  homepage: string;
  license?: string;
  priority: number;
}

export interface PromoteSourceInput {
  source: PromotionSource;
  version: string;
  contentHash: string;
  retrievedAt: string;
  snapshotPath?: string;
  observations: Observation[];
}

export interface PromotionResult {
  sourceRunId: string;
  releaseId: string;
  entitiesCreated: number;
  entitiesMatched: number;
  recipesCreated: number;
  dropsCreated: number;
  nodeDetailsCreated: number;
  rankingSetsCreated: number;
  rankingsCreated: number;
  conflictsCreated: number;
}

interface ExistingRun {
  id: string;
  contentHash: string;
  status: string;
}

export function promoteSource(sqlite: Database.Database, input: PromoteSourceInput): PromotionResult {
  validateInput(input);
  return sqlite.transaction(() => promoteInTransaction(sqlite, input))();
}

function promoteInTransaction(sqlite: Database.Database, input: PromoteSourceInput): PromotionResult {
  const existing = sqlite.prepare(
    "select id, content_hash as contentHash, status from source_runs where source_id = ? and version = ?",
  ).get(input.source.id, input.version) as ExistingRun | undefined;
  if (existing) {
    if (existing.contentHash !== input.contentHash) {
      throw new Error(`Source ${input.source.id} reused version ${input.version} with different content`);
    }
    if (existing.status === "active") {
      const release = sqlite.prepare("select id from catalog_releases where active = 1 order by promoted_at desc limit 1").get() as { id: string } | undefined;
      return { sourceRunId: existing.id, releaseId: release?.id ?? "unchanged", entitiesCreated: 0, entitiesMatched: 0, recipesCreated: 0, dropsCreated: 0, nodeDetailsCreated: 0, rankingSetsCreated: 0, rankingsCreated: 0, conflictsCreated: 0 };
    }
    throw new Error(`Source version ${input.source.id}@${input.version} has already been imported and is not active`);
  }

  sqlite.prepare(`
    insert into sources (id, name, homepage, license, priority, enabled)
    values (?, ?, ?, ?, ?, 1)
    on conflict(id) do update set
      name = excluded.name,
      homepage = excluded.homepage,
      license = excluded.license,
      priority = excluded.priority,
      enabled = 1
  `).run(input.source.id, input.source.name, input.source.homepage, input.source.license ?? null, input.source.priority);

  const sourceRunId = randomUUID();
  const releaseId = randomUUID();
  const retrievedAt = new Date(input.retrievedAt);
  sqlite.prepare(`
    insert into source_runs (id, source_id, version, content_hash, retrieved_at, snapshot_path, status)
    values (?, ?, ?, ?, ?, ?, 'staged')
  `).run(sourceRunId, input.source.id, input.version, input.contentHash, retrievedAt.getTime(), input.snapshotPath ?? null);

  const state = loadResolutionState(sqlite);
  const counts = { entitiesCreated: 0, entitiesMatched: 0, recipesCreated: 0, dropsCreated: 0, nodeDetailsCreated: 0, rankingSetsCreated: 0, rankingsCreated: 0, conflictsCreated: 0 };

  for (const observation of input.observations) {
    if (observation.type !== "entity") continue;
    const entityId = resolveAndWriteEntity(sqlite, state, observation, input.source.priority, sourceRunId, counts);
    if (entityId) indexObservation(state, entityId, observation);
  }

  const rankingSets = new Map<string, { id: string; scale: Set<string> }>();
  for (const observation of input.observations) {
    if (observation.type !== "ranking-set") continue;
    const id = randomUUID();
    sqlite.prepare(`
      insert into ranking_sets (id, source_run_id, set_key, title, author, published_at, game_version, scope, scale_json, license_note, source_record_key, citation_url, source_path)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sourceRunId, observation.key, observation.title, observation.author, new Date(observation.publishedAt).getTime(), observation.gameVersion ?? null, observation.scope, JSON.stringify(observation.scale), observation.licenseNote, observation.evidence.sourceRecordKey, observation.evidence.citationUrl ?? null, observation.evidence.path ?? null);
    rankingSets.set(observation.key, { id, scale: new Set(observation.scale) });
    counts.rankingSetsCreated += 1;
  }

  for (const observation of input.observations) {
    if (observation.type !== "ranking") continue;
    const set = rankingSets.get(observation.setKey);
    const entityId = state.externalIds.get(externalKey(observation.subjectExternalId));
    if (!set || !entityId || !set.scale.has(observation.tier)) {
      const reason = !set
        ? "Ranking refers to an unresolved ranking set"
        : !entityId
          ? "Ranking refers to an unresolved entity"
          : `Ranking tier ${observation.tier} is outside its declared scale`;
      writeConflict(sqlite, sourceRunId, observation.evidence.sourceRecordKey, reason, [], counts);
      continue;
    }
    sqlite.prepare(`
      insert into editorial_rankings (id, set_id, entity_id, tier, position, timestamp_seconds, notes, source_record_key, citation_url, source_path)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), set.id, entityId, observation.tier, observation.position ?? null, observation.timestampSeconds ?? null, observation.notes ?? null, observation.evidence.sourceRecordKey, observation.evidence.citationUrl ?? null, observation.evidence.path ?? null);
    counts.rankingsCreated += 1;
  }

  for (const observation of input.observations) {
    if (observation.type === "node-detail") {
      const nodeId = state.externalIds.get(externalKey(observation.nodeExternalId));
      if (!nodeId) {
        writeConflict(sqlite, sourceRunId, observation.evidence.sourceRecordKey, "Node detail refers to an unresolved entity", [], counts);
        continue;
      }
      sqlite.prepare(`
        insert into node_details
          (id, entity_id, planet, mission_type, faction, minimum_enemy_level, maximum_enemy_level,
           mastery_requirement, node_type, source_run_id, source_record_key, citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), nodeId, observation.planet, observation.missionType ?? null, observation.faction ?? null,
        observation.minimumEnemyLevel ?? null, observation.maximumEnemyLevel ?? null,
        observation.masteryRequirement ?? null, observation.nodeType ?? null, sourceRunId,
        observation.evidence.sourceRecordKey, observation.evidence.citationUrl ?? null, observation.evidence.path ?? null);
      counts.nodeDetailsCreated += 1;
    }
    if (observation.type === "drop") {
      const rewardId = state.externalIds.get(externalKey(observation.rewardExternalId));
      const nodeId = observation.nodeExternalId
        ? state.externalIds.get(externalKey(observation.nodeExternalId))
        : undefined;
      if (!rewardId || (observation.nodeExternalId && !nodeId)) {
        writeConflict(sqlite, sourceRunId, observation.evidence.sourceRecordKey, "Drop refers to an unresolved entity", [], counts);
        continue;
      }
      sqlite.prepare(`
        insert into drops (id, reward_id, node_id, location_label, chance, rotation, quantity, source_run_id, source_record_key, citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), rewardId, nodeId ?? null, observation.locationLabel, observation.chance ?? null, observation.rotation ?? null, observation.quantity ?? 1, sourceRunId, observation.evidence.sourceRecordKey, observation.evidence.citationUrl ?? null, observation.evidence.path ?? null);
      counts.dropsCreated += 1;
    }

    if (observation.type === "recipe") {
      const outputId = state.externalIds.get(externalKey(observation.outputExternalId));
      const ingredients = observation.ingredients.map((ingredient) => ({
        entityId: state.externalIds.get(externalKey(ingredient.externalId)),
        quantity: ingredient.quantity,
      }));
      if (!outputId || ingredients.some((ingredient) => !ingredient.entityId)) {
        writeConflict(sqlite, sourceRunId, observation.evidence.sourceRecordKey, "Recipe refers to an unresolved entity", [], counts);
        continue;
      }
      const recipeId = randomUUID();
      sqlite.prepare("insert into recipes (id, output_id, output_quantity, source_run_id, source_record_key, citation_url, source_path) values (?, ?, ?, ?, ?, ?, ?)")
        .run(recipeId, outputId, observation.outputQuantity ?? 1, sourceRunId, observation.evidence.sourceRecordKey, observation.evidence.citationUrl ?? null, observation.evidence.path ?? null);
      const quantities = new Map<EntityId, number>();
      for (const ingredient of ingredients) {
        const entityId = ingredient.entityId!;
        quantities.set(entityId, (quantities.get(entityId) ?? 0) + ingredient.quantity);
      }
      const insertIngredient = sqlite.prepare("insert into recipe_ingredients (recipe_id, entity_id, quantity) values (?, ?, ?)");
      for (const [entityId, quantity] of quantities) insertIngredient.run(recipeId, entityId, quantity);
      counts.recipesCreated += 1;
    }
  }

  const now = Date.now();
  sqlite.prepare("update source_runs set status = 'staged' where source_id = ? and status = 'active'").run(input.source.id);
  sqlite.prepare("update source_runs set status = 'active' where id = ?").run(sourceRunId);
  sqlite.prepare("update catalog_releases set active = 0 where active = 1").run();
  sqlite.prepare("insert into catalog_releases (id, created_at, promoted_at, active) values (?, ?, ?, 1)").run(releaseId, now, now);

  return { sourceRunId, releaseId, ...counts };
}

function resolveAndWriteEntity(
  sqlite: Database.Database,
  state: ResolutionState,
  observation: EntityObservation,
  sourcePriority: number,
  sourceRunId: string,
  counts: Omit<PromotionResult, "sourceRunId" | "releaseId">,
): EntityId | undefined {
  const resolution = resolveEntity(observation, state);
  if (resolution.status === "conflict") {
    writeConflict(sqlite, sourceRunId, observation.evidence.sourceRecordKey, "Entity identity is ambiguous", resolution.candidateIds, counts);
    return undefined;
  }

  let entityId: EntityId;
  if (resolution.status === "new") {
    if (!observation.fields.name || !observation.fields.slug) {
      writeConflict(sqlite, sourceRunId, observation.evidence.sourceRecordKey, "New entity is missing a name or slug", [], counts);
      return undefined;
    }
    entityId = randomUUID() as EntityId;
    sqlite.prepare(`
      insert into entities (id, kind, name, slug, description, retired, updated_at)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(entityId, observation.kind, observation.fields.name, observation.fields.slug, observation.fields.description ?? null, observation.tombstone ? 1 : 0, Date.now());
    state.entities.set(entityId, {
      id: entityId,
      kind: observation.kind,
      name: observation.fields.name,
      slug: observation.fields.slug,
      description: observation.fields.description,
      retired: observation.tombstone ?? false,
    });
    counts.entitiesCreated += 1;
  } else {
    entityId = resolution.entityId;
    const entity = state.entities.get(entityId)!;
    if (entity.kind !== observation.kind && observation.kind !== "unknown" && entity.kind !== "unknown") {
      writeConflict(sqlite, sourceRunId, observation.evidence.sourceRecordKey, `Entity kind disagrees with ${entity.kind}`, [entityId], counts);
      return undefined;
    }
    if (entity.kind === "unknown" && observation.kind !== "unknown") {
      sqlite.prepare("update entities set kind = ?, updated_at = ? where id = ?").run(observation.kind, Date.now(), entityId);
      state.entities.set(entityId, { ...entity, kind: observation.kind });
    }
    updateWinningFields(sqlite, entityId, observation, sourcePriority);
    counts.entitiesMatched += 1;
  }

  if (observation.tombstone) {
    sqlite.prepare("update entities set retired = 1, updated_at = ? where id = ?").run(Date.now(), entityId);
  }
  const insertExternalId = sqlite.prepare("insert or ignore into external_ids (entity_id, source_id, namespace, value) values (?, ?, ?, ?)");
  for (const externalId of observation.externalIds) {
    insertExternalId.run(entityId, externalId.sourceId, externalId.namespace, externalId.value);
  }
  const insertAlias = sqlite.prepare("insert or ignore into entity_aliases (entity_id, normalized, display) values (?, ?, ?)");
  const names = [observation.fields.name, ...(observation.aliases ?? [])].filter((value): value is string => Boolean(value));
  for (const name of names) insertAlias.run(entityId, normalizedAlias(name), name);

  const writeProvenance = sqlite.prepare(`
    insert into fact_provenance (entity_id, field, source_run_id, source_record_key, citation_url, source_path)
    values (?, ?, ?, ?, ?, ?)
    on conflict(entity_id, field, source_run_id) do update set
      source_record_key = excluded.source_record_key,
      citation_url = excluded.citation_url,
      source_path = excluded.source_path
  `);
  for (const field of ["name", "slug", "description"] as const) {
    if (observation.fields[field] !== undefined) {
      writeProvenance.run(entityId, field, sourceRunId, observation.evidence.sourceRecordKey, observation.evidence.citationUrl ?? null, observation.evidence.path ?? null);
    }
  }
  return entityId;
}

function updateWinningFields(sqlite: Database.Database, entityId: EntityId, observation: EntityObservation, sourcePriority: number): void {
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const field of ["name", "slug", "description"] as const) {
    const value = observation.fields[field];
    if (value === undefined) continue;
    const winner = sqlite.prepare(`
      select max(s.priority) as priority
      from fact_provenance p
      join source_runs r on r.id = p.source_run_id and r.status = 'active'
      join sources s on s.id = r.source_id
      where p.entity_id = ? and p.field = ?
    `).get(entityId, field) as { priority: number | null };
    if (winner.priority === null || sourcePriority >= winner.priority) {
      updates.push(`${field} = ?`);
      values.push(value);
    }
  }
  if (updates.length) {
    values.push(Date.now(), entityId);
    sqlite.prepare(`update entities set ${updates.join(", ")}, updated_at = ? where id = ?`).run(...values);
  }
}

function loadResolutionState(sqlite: Database.Database): ResolutionState {
  const entityRows = sqlite.prepare("select id, kind, name, slug, description, retired from entities").all() as Array<Omit<CanonicalEntity, "retired"> & { retired: number }>;
  const entities = new Map<EntityId, CanonicalEntity>();
  for (const row of entityRows) entities.set(row.id, { ...row, retired: Boolean(row.retired) });
  const externalIds = new Map<string, EntityId>();
  for (const row of sqlite.prepare("select entity_id as entityId, source_id as sourceId, namespace, value from external_ids").all() as Array<{ entityId: EntityId; sourceId: string; namespace: string; value: string }>) {
    externalIds.set(externalKey(row), row.entityId);
  }
  const aliases = new Map<string, EntityId[]>();
  for (const row of sqlite.prepare("select entity_id as entityId, normalized from entity_aliases").all() as Array<{ entityId: EntityId; normalized: string }>) {
    aliases.set(row.normalized, [...(aliases.get(row.normalized) ?? []), row.entityId]);
  }
  return { entities, externalIds, aliases };
}

function indexObservation(state: ResolutionState, entityId: EntityId, observation: EntityObservation): void {
  for (const externalId of observation.externalIds) state.externalIds.set(externalKey(externalId), entityId);
  const names = [observation.fields.name, ...(observation.aliases ?? [])].filter((value): value is string => Boolean(value));
  for (const name of names) {
    const normalized = normalizedAlias(name);
    const ids = state.aliases.get(normalized) ?? [];
    if (!ids.includes(entityId)) state.aliases.set(normalized, [...ids, entityId]);
  }
}

function writeConflict(
  sqlite: Database.Database,
  sourceRunId: string,
  recordKey: string,
  reason: string,
  candidates: EntityId[],
  counts: { conflictsCreated: number },
): void {
  sqlite.prepare(`
    insert into ingestion_conflicts (id, source_run_id, record_key, reason, candidates_json)
    values (?, ?, ?, ?, ?)
  `).run(randomUUID(), sourceRunId, recordKey, reason, JSON.stringify(candidates));
  counts.conflictsCreated += 1;
}

function validateInput(input: PromoteSourceInput): void {
  if (!input.source.id || !input.version || !input.contentHash || !input.observations.length) {
    throw new Error("Promotion input is incomplete");
  }
  const retrievedAt = new Date(input.retrievedAt);
  if (Number.isNaN(retrievedAt.getTime())) throw new Error("Promotion retrievedAt is invalid");
  for (const observation of input.observations) {
    if (observation.evidence.sourceId !== input.source.id || observation.evidence.snapshotVersion !== input.version) {
      throw new Error("Observation evidence does not match the promoted source snapshot");
    }
    if (observation.type === "drop" && observation.chance !== undefined && (observation.chance < 0 || observation.chance > 1)) {
      throw new Error(`Drop chance is outside [0, 1]: ${observation.chance}`);
    }
    if (observation.type === "drop" && (!Number.isInteger(observation.quantity ?? 1) || (observation.quantity ?? 1) < 1)) {
      throw new Error("Drop quantity must be a positive integer");
    }
    if (observation.type === "recipe") {
      if (!Number.isInteger(observation.outputQuantity ?? 1) || (observation.outputQuantity ?? 1) < 1) throw new Error("Recipe output quantity must be a positive integer");
      if (observation.ingredients.some((ingredient) => !Number.isInteger(ingredient.quantity) || ingredient.quantity < 1)) throw new Error("Recipe ingredient quantities must be positive integers");
    }
    if (observation.type === "ranking-set") {
      if (!observation.key || !observation.title || !observation.author || !observation.scope || !observation.licenseNote || !observation.scale.length || new Set(observation.scale).size !== observation.scale.length) {
        throw new Error("Ranking set metadata or scale is invalid");
      }
      if (Number.isNaN(new Date(observation.publishedAt).getTime())) throw new Error("Ranking set publishedAt is invalid");
    }
    if (observation.type === "ranking") {
      if (!observation.setKey || !observation.tier) throw new Error("Ranking is incomplete");
      if (observation.position !== undefined && (!Number.isInteger(observation.position) || observation.position < 1)) throw new Error("Ranking position must be a positive integer");
      if (observation.timestampSeconds !== undefined && (!Number.isInteger(observation.timestampSeconds) || observation.timestampSeconds < 0)) throw new Error("Ranking timestamp must be a non-negative integer");
    }
    if (observation.type === "node-detail") {
      if (!observation.planet) throw new Error("Node detail planet is required");
      for (const [label, value] of [["minimum enemy level", observation.minimumEnemyLevel], ["maximum enemy level", observation.maximumEnemyLevel], ["mastery requirement", observation.masteryRequirement], ["node type", observation.nodeType]] as const) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(`Node detail ${label} must be a non-negative integer`);
      }
      if (observation.minimumEnemyLevel !== undefined && observation.maximumEnemyLevel !== undefined && observation.maximumEnemyLevel < observation.minimumEnemyLevel) throw new Error("Node detail level range is inverted");
    }
  }
}
