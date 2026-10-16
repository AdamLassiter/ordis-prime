import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ARCANE_CLASSES,
  WEAPON_CLASSES,
  externalKey,
  normalizedAlias,
  resolveEntity,
  type CanonicalEntity,
  type EntityId,
  type EntityObservation,
  type ExternalIdentifier,
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
  relationsCreated: number;
  enhancementOptionsCreated: number;
  rankingSetsCreated: number;
  rankingsCreated: number;
  conflictsCreated: number;
}

interface ExistingRun {
  id: string;
  contentHash: string;
  status: string;
}

export function promoteSource(
  sqlite: Database.Database,
  input: PromoteSourceInput,
): PromotionResult {
  validateInput(input);
  return sqlite.transaction(() => promoteInTransaction(sqlite, input))();
}

export function previewSourcePromotion(
  sqlite: Database.Database,
  input: PromoteSourceInput,
): PromotionResult {
  const rollbackMarker = {};
  let result: PromotionResult | undefined;
  try {
    sqlite.transaction(() => {
      result = promoteSource(sqlite, input);
      throw rollbackMarker;
    })();
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }
  if (!result) throw new Error("Source preview did not produce a result");
  return result;
}

function promoteInTransaction(
  sqlite: Database.Database,
  input: PromoteSourceInput,
): PromotionResult {
  const existing = sqlite
    .prepare(
      "select id, content_hash as contentHash, status from source_runs where source_id = ? and version = ?",
    )
    .get(input.source.id, input.version) as ExistingRun | undefined;
  if (existing) {
    if (existing.contentHash !== input.contentHash) {
      throw new Error(
        `Source ${input.source.id} reused version ${input.version} with different content`,
      );
    }
    if (existing.status === "active") {
      const release = sqlite
        .prepare(
          "select id from catalog_releases where active = 1 order by promoted_at desc limit 1",
        )
        .get() as { id: string } | undefined;
      return {
        sourceRunId: existing.id,
        releaseId: release?.id ?? "unchanged",
        entitiesCreated: 0,
        entitiesMatched: 0,
        recipesCreated: 0,
        dropsCreated: 0,
        nodeDetailsCreated: 0,
        relationsCreated: 0,
        enhancementOptionsCreated: 0,
        rankingSetsCreated: 0,
        rankingsCreated: 0,
        conflictsCreated: 0,
      };
    }
    throw new Error(
      `Source version ${input.source.id}@${input.version} has already been imported and is not active`,
    );
  }

  sqlite
    .prepare(
      `
    insert into sources (id, name, homepage, license, priority, enabled)
    values (?, ?, ?, ?, ?, 1)
    on conflict(id) do update set
      name = excluded.name,
      homepage = excluded.homepage,
      license = excluded.license,
      priority = excluded.priority,
      enabled = 1
  `,
    )
    .run(
      input.source.id,
      input.source.name,
      input.source.homepage,
      input.source.license ?? null,
      input.source.priority,
    );

  const sourceRunId = randomUUID();
  const releaseId = randomUUID();
  const retrievedAt = new Date(input.retrievedAt);
  sqlite
    .prepare(
      `
    insert into source_runs (id, source_id, version, content_hash, retrieved_at, snapshot_path, status)
    values (?, ?, ?, ?, ?, ?, 'staged')
  `,
    )
    .run(
      sourceRunId,
      input.source.id,
      input.version,
      input.contentHash,
      retrievedAt.getTime(),
      input.snapshotPath ?? null,
    );

  const state = loadResolutionState(sqlite);
  const counts = {
    entitiesCreated: 0,
    entitiesMatched: 0,
    recipesCreated: 0,
    dropsCreated: 0,
    nodeDetailsCreated: 0,
    relationsCreated: 0,
    enhancementOptionsCreated: 0,
    rankingSetsCreated: 0,
    rankingsCreated: 0,
    conflictsCreated: 0,
  };

  for (const observation of input.observations) {
    if (observation.type !== "entity") continue;
    const entityId = resolveAndWriteEntity(
      sqlite,
      state,
      observation,
      input.source.priority,
      sourceRunId,
      counts,
    );
    if (entityId) indexObservation(state, entityId, observation);
  }

  const rankingSets = new Map<string, { id: string; scale: Set<string> }>();
  for (const observation of input.observations) {
    if (observation.type !== "ranking-set") continue;
    const id = randomUUID();
    sqlite
      .prepare(
        `
      insert into ranking_sets (id, source_run_id, set_key, title, author, published_at, game_version, scope, scale_json, license_note, source_record_key, citation_url, source_path)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        sourceRunId,
        observation.key,
        observation.title,
        observation.author,
        new Date(observation.publishedAt).getTime(),
        observation.gameVersion ?? null,
        observation.scope,
        JSON.stringify(observation.scale),
        observation.licenseNote,
        observation.evidence.sourceRecordKey,
        observation.evidence.citationUrl ?? null,
        observation.evidence.path ?? null,
      );
    rankingSets.set(observation.key, { id, scale: new Set(observation.scale) });
    counts.rankingSetsCreated += 1;
  }

  for (const observation of input.observations) {
    if (observation.type !== "ranking") continue;
    const set = rankingSets.get(observation.setKey);
    const entityId = state.externalIds.get(
      externalKey(observation.subjectExternalId),
    );
    if (!set || !entityId || !set.scale.has(observation.tier)) {
      const reason = !set
        ? "Ranking refers to an unresolved ranking set"
        : !entityId
          ? "Ranking refers to an unresolved entity"
          : `Ranking tier ${observation.tier} is outside its declared scale`;
      writeConflict(
        sqlite,
        sourceRunId,
        observation.evidence.sourceRecordKey,
        reason,
        [],
        counts,
      );
      continue;
    }
    sqlite
      .prepare(
        `
      insert into editorial_rankings (id, set_id, entity_id, tier, position, timestamp_seconds, notes, source_record_key, citation_url, source_path)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        randomUUID(),
        set.id,
        entityId,
        observation.tier,
        observation.position ?? null,
        observation.timestampSeconds ?? null,
        observation.notes ?? null,
        observation.evidence.sourceRecordKey,
        observation.evidence.citationUrl ?? null,
        observation.evidence.path ?? null,
      );
    counts.rankingsCreated += 1;
  }

  for (const observation of input.observations) {
    if (observation.type === "enhancement-option") {
      const entityId = state.externalIds.get(
        externalKey(observation.subjectExternalId),
      );
      if (!entityId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Enhancement option refers to an unresolved entity",
          [],
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `
        insert into entity_enhancement_options
          (id, entity_id, key, label, source_run_id, source_record_key, citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          randomUUID(),
          entityId,
          observation.key,
          observation.label,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.enhancementOptionsCreated += 1;
    }
    if (observation.type === "entity-relation") {
      const fromEntityId = state.externalIds.get(
        externalKey(observation.fromExternalId),
      );
      const toEntityId = state.externalIds.get(
        externalKey(observation.toExternalId),
      );
      if (!fromEntityId || !toEntityId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Relation refers to an unresolved entity",
          [fromEntityId, toEntityId].filter((id): id is EntityId =>
            Boolean(id),
          ),
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `
        insert into entity_relations
          (id, from_entity_id, to_entity_id, kind, notes, source_run_id, source_record_key, citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          randomUUID(),
          fromEntityId,
          toEntityId,
          observation.kind,
          observation.notes ?? null,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.relationsCreated += 1;
    }
    if (observation.type === "node-detail") {
      const nodeId = state.externalIds.get(
        externalKey(observation.nodeExternalId),
      );
      if (!nodeId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Node detail refers to an unresolved entity",
          [],
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `
        insert into node_details
          (id, entity_id, planet, mission_type, faction, minimum_enemy_level, maximum_enemy_level,
           mastery_requirement, node_type, source_run_id, source_record_key, citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          randomUUID(),
          nodeId,
          observation.planet,
          observation.missionType ?? null,
          observation.faction ?? null,
          observation.minimumEnemyLevel ?? null,
          observation.maximumEnemyLevel ?? null,
          observation.masteryRequirement ?? null,
          observation.nodeType ?? null,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.nodeDetailsCreated += 1;
    }
    if (observation.type === "drop") {
      const rewardId = state.externalIds.get(
        externalKey(observation.rewardExternalId),
      );
      const nodeId = observation.nodeExternalId
        ? state.externalIds.get(externalKey(observation.nodeExternalId))
        : undefined;
      if (!rewardId || (observation.nodeExternalId && !nodeId)) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Drop refers to an unresolved entity",
          [],
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `
        insert into drops (id, reward_id, node_id, location_label, chance, rotation, quantity, source_run_id, source_record_key, citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          randomUUID(),
          rewardId,
          nodeId ?? null,
          observation.locationLabel,
          observation.chance ?? null,
          observation.rotation ?? null,
          observation.quantity ?? 1,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.dropsCreated += 1;
    }

    if (observation.type === "recipe") {
      const outputId = state.externalIds.get(
        externalKey(observation.outputExternalId),
      );
      const ingredients = observation.ingredients.map((ingredient) => ({
        entityId: state.externalIds.get(externalKey(ingredient.externalId)),
        quantity: ingredient.quantity,
      }));
      if (!outputId || ingredients.some((ingredient) => !ingredient.entityId)) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Recipe refers to an unresolved entity",
          [],
          counts,
        );
        continue;
      }
      const recipeId = randomUUID();
      sqlite
        .prepare(
          "insert into recipes (id, output_id, output_quantity, source_run_id, source_record_key, citation_url, source_path) values (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          recipeId,
          outputId,
          observation.outputQuantity ?? 1,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      const quantities = new Map<EntityId, number>();
      for (const ingredient of ingredients) {
        const entityId = ingredient.entityId!;
        quantities.set(
          entityId,
          (quantities.get(entityId) ?? 0) + ingredient.quantity,
        );
      }
      const insertIngredient = sqlite.prepare(
        "insert into recipe_ingredients (recipe_id, entity_id, quantity) values (?, ?, ?)",
      );
      for (const [entityId, quantity] of quantities)
        insertIngredient.run(recipeId, entityId, quantity);
      counts.recipesCreated += 1;
    }
    if (
      observation.type === "enhancement-option" &&
      (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(observation.key) ||
        !observation.label.trim() ||
        observation.label.length > 240)
    ) {
      throw new Error("Enhancement option key or label is invalid");
    }
  }

  const now = Date.now();
  sqlite
    .prepare(
      "update source_runs set status = 'staged' where source_id = ? and status = 'active'",
    )
    .run(input.source.id);
  sqlite
    .prepare("update source_runs set status = 'active' where id = ?")
    .run(sourceRunId);
  recomputeActiveEntityFields(sqlite);
  validateComposedCatalog(sqlite);
  sqlite
    .prepare("update catalog_releases set active = 0 where active = 1")
    .run();
  sqlite
    .prepare(
      "insert into catalog_releases (id, created_at, promoted_at, active) values (?, ?, ?, 1)",
    )
    .run(releaseId, now, now);
  sqlite
    .prepare(
      `
    insert into catalog_release_sources (release_id, source_id, source_run_id)
    select ?, source_id, id from source_runs where status = 'active'
  `,
    )
    .run(releaseId);

  return { sourceRunId, releaseId, ...counts };
}

function validateComposedCatalog(sqlite: Database.Database): void {
  const duplicateActiveSource = sqlite
    .prepare(
      `select source_id as sourceId, count(*) as count from source_runs
       where status = 'active' group by source_id having count(*) != 1 limit 1`,
    )
    .get() as { sourceId: string; count: number } | undefined;
  if (duplicateActiveSource)
    throw new Error(
      `Composed catalog has ${duplicateActiveSource.count} active runs for source ${duplicateActiveSource.sourceId}`,
    );

  const retiredReference = sqlite
    .prepare(
      `with active_refs as (
        select 'recipe output' as factType, recipe.source_record_key as recordKey, recipe.output_id as entityId
          from recipes recipe join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
        union all
        select 'recipe ingredient', recipe.source_record_key, ingredient.entity_id
          from recipe_ingredients ingredient join recipes recipe on recipe.id = ingredient.recipe_id
          join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
        union all
        select 'drop reward', item_drop.source_record_key, item_drop.reward_id
          from drops item_drop join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
        union all
        select 'drop node', item_drop.source_record_key, item_drop.node_id
          from drops item_drop join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
          where item_drop.node_id is not null
        union all
        select 'node detail', detail.source_record_key, detail.entity_id
          from node_details detail join source_runs run on run.id = detail.source_run_id and run.status = 'active'
        union all
        select 'relation origin', relation.source_record_key, relation.from_entity_id
          from entity_relations relation join source_runs run on run.id = relation.source_run_id and run.status = 'active'
        union all
        select 'relation target', relation.source_record_key, relation.to_entity_id
          from entity_relations relation join source_runs run on run.id = relation.source_run_id and run.status = 'active'
        union all
        select 'enhancement option', option.source_record_key, option.entity_id
          from entity_enhancement_options option join source_runs run on run.id = option.source_run_id and run.status = 'active'
        union all
        select 'ranking member', ranking.source_record_key, ranking.entity_id
          from editorial_rankings ranking join ranking_sets ranking_set on ranking_set.id = ranking.set_id
          join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
      )
      select active_refs.factType, active_refs.recordKey, entity.kind, entity.slug
      from active_refs join entities entity on entity.id = active_refs.entityId
      where entity.retired = 1 limit 1`,
    )
    .get() as
    | { factType: string; recordKey: string | null; kind: string; slug: string }
    | undefined;
  if (retiredReference)
    throw new Error(
      `Composed catalog ${retiredReference.factType} ${retiredReference.recordKey ?? "without record key"} references retired ${retiredReference.kind}:${retiredReference.slug}`,
    );

  const invalidNodeReference = sqlite
    .prepare(
      `select factType, recordKey, kind, slug from (
        select 'drop node' as factType, item_drop.source_record_key as recordKey, entity.kind, entity.slug
          from drops item_drop join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
          join entities entity on entity.id = item_drop.node_id where entity.kind != 'node'
        union all
        select 'node detail', detail.source_record_key, entity.kind, entity.slug
          from node_details detail join source_runs run on run.id = detail.source_run_id and run.status = 'active'
          join entities entity on entity.id = detail.entity_id where entity.kind != 'node'
        union all
        select 'connection origin', relation.source_record_key, entity.kind, entity.slug
          from entity_relations relation join source_runs run on run.id = relation.source_run_id and run.status = 'active'
          join entities entity on entity.id = relation.from_entity_id
          where relation.kind = 'connects-to' and entity.kind != 'node'
        union all
        select 'connection target', relation.source_record_key, entity.kind, entity.slug
          from entity_relations relation join source_runs run on run.id = relation.source_run_id and run.status = 'active'
          join entities entity on entity.id = relation.to_entity_id
          where relation.kind = 'connects-to' and entity.kind != 'node'
      ) limit 1`,
    )
    .get() as
    | { factType: string; recordKey: string | null; kind: string; slug: string }
    | undefined;
  if (invalidNodeReference)
    throw new Error(
      `Composed catalog ${invalidNodeReference.factType} ${invalidNodeReference.recordKey ?? "without record key"} requires a node but resolved ${invalidNodeReference.kind}:${invalidNodeReference.slug}`,
    );

  const invalidEnhancementSubject = sqlite
    .prepare(
      `select option.source_record_key as recordKey, entity.kind, entity.slug
       from entity_enhancement_options option
       join source_runs run on run.id = option.source_run_id and run.status = 'active'
       join entities entity on entity.id = option.entity_id
       where entity.kind != 'shard' limit 1`,
    )
    .get() as { recordKey: string; kind: string; slug: string } | undefined;
  if (invalidEnhancementSubject)
    throw new Error(
      `Composed catalog enhancement option ${invalidEnhancementSubject.recordKey} requires a shard but resolved ${invalidEnhancementSubject.kind}:${invalidEnhancementSubject.slug}`,
    );
}

function recomputeActiveEntityFields(sqlite: Database.Database): void {
  const columns = {
    name: "name",
    slug: "slug",
    description: "description",
    arcaneClass: "arcane_class",
    weaponClass: "weapon_class",
  } as const;
  const winners = sqlite
    .prepare(
      `with ranked as (
        select provenance.entity_id as entityId, provenance.field, provenance.value_json as valueJson,
          row_number() over (
            partition by provenance.entity_id, provenance.field
            order by source.priority desc, run.retrieved_at desc, run.id desc
          ) as preference
        from fact_provenance provenance
        join source_runs run on run.id = provenance.source_run_id and run.status = 'active'
        join sources source on source.id = run.source_id
        where provenance.value_json is not null
      )
      select entityId, field, valueJson from ranked where preference = 1`,
    )
    .all() as Array<{
    entityId: string;
    field: keyof typeof columns;
    valueJson: string;
  }>;
  const updates = new Map<string, Array<{ column: string; value: string }>>();
  for (const winner of winners) {
    if (!(winner.field in columns)) continue;
    const value: unknown = JSON.parse(winner.valueJson);
    if (typeof value !== "string")
      throw new Error(
        `Stored entity field ${winner.field} for ${winner.entityId} is invalid`,
      );
    const fields = updates.get(winner.entityId) ?? [];
    fields.push({ column: columns[winner.field], value });
    updates.set(winner.entityId, fields);
  }
  for (const [entityId, fields] of updates) {
    sqlite
      .prepare(
        `update entities set ${fields.map(({ column }) => `${column} = ?`).join(", ")}, updated_at = ? where id = ?`,
      )
      .run(...fields.map(({ value }) => value), Date.now(), entityId);
  }
  for (const [field, column] of [
    ["description", "description"],
    ["arcaneClass", "arcane_class"],
    ["weaponClass", "weapon_class"],
  ] as const) {
    sqlite
      .prepare(
        `update entities set ${column} = null, updated_at = ?
         where exists (
           select 1 from fact_provenance historical
           where historical.entity_id = entities.id and historical.field = ? and historical.value_json is not null
         ) and not exists (
           select 1 from fact_provenance active
           join source_runs run on run.id = active.source_run_id and run.status = 'active'
           where active.entity_id = entities.id and active.field = ? and active.value_json is not null
         )`,
      )
      .run(Date.now(), field, field);
  }
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
    writeConflict(
      sqlite,
      sourceRunId,
      observation.evidence.sourceRecordKey,
      "Entity identity is ambiguous",
      resolution.candidateIds,
      counts,
      observation.externalIds,
    );
    return undefined;
  }

  let entityId: EntityId;
  if (resolution.status === "new") {
    const missingSourceIds = [
      ...new Set(
        observation.externalIds.map((externalId) => externalId.sourceId),
      ),
    ].filter(
      (sourceId) =>
        !sqlite.prepare("select 1 from sources where id = ?").get(sourceId),
    );
    if (missingSourceIds.length) {
      writeConflict(
        sqlite,
        sourceRunId,
        observation.evidence.sourceRecordKey,
        `External identifier source is not registered: ${missingSourceIds.join(", ")}`,
        [],
        counts,
        observation.externalIds,
      );
      return undefined;
    }
    if (!observation.fields.name || !observation.fields.slug) {
      writeConflict(
        sqlite,
        sourceRunId,
        observation.evidence.sourceRecordKey,
        "New entity is missing a name or slug",
        [],
        counts,
        observation.externalIds,
      );
      return undefined;
    }
    entityId = randomUUID() as EntityId;
    sqlite
      .prepare(
        `
      insert into entities (id, kind, name, slug, description, arcane_class, weapon_class, retired, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        entityId,
        observation.kind,
        observation.fields.name,
        observation.fields.slug,
        observation.fields.description ?? null,
        observation.fields.arcaneClass ?? null,
        observation.fields.weaponClass ?? null,
        observation.tombstone ? 1 : 0,
        Date.now(),
      );
    state.entities.set(entityId, {
      id: entityId,
      kind: observation.kind,
      name: observation.fields.name,
      slug: observation.fields.slug,
      description: observation.fields.description,
      arcaneClass: observation.fields.arcaneClass,
      weaponClass: observation.fields.weaponClass,
      retired: observation.tombstone ?? false,
    });
    counts.entitiesCreated += 1;
  } else {
    entityId = resolution.entityId;
    const entity = state.entities.get(entityId)!;
    if (
      entity.kind !== observation.kind &&
      observation.kind !== "unknown" &&
      entity.kind !== "unknown"
    ) {
      writeConflict(
        sqlite,
        sourceRunId,
        observation.evidence.sourceRecordKey,
        `Entity kind disagrees with ${entity.kind}`,
        [entityId],
        counts,
        observation.externalIds,
      );
      return undefined;
    }
    if (entity.kind === "unknown" && observation.kind !== "unknown") {
      sqlite
        .prepare("update entities set kind = ?, updated_at = ? where id = ?")
        .run(observation.kind, Date.now(), entityId);
      state.entities.set(entityId, { ...entity, kind: observation.kind });
    }
    updateWinningFields(sqlite, entityId, observation, sourcePriority);
    counts.entitiesMatched += 1;
  }

  if (observation.tombstone) {
    sqlite
      .prepare("update entities set retired = 1, updated_at = ? where id = ?")
      .run(Date.now(), entityId);
  }
  const insertExternalId = sqlite.prepare(
    "insert or ignore into external_ids (entity_id, source_id, namespace, value) values (?, ?, ?, ?)",
  );
  for (const externalId of observation.externalIds) {
    insertExternalId.run(
      entityId,
      externalId.sourceId,
      externalId.namespace,
      externalId.value,
    );
  }
  const insertAlias = sqlite.prepare(
    "insert or ignore into entity_aliases (entity_id, normalized, display) values (?, ?, ?)",
  );
  const names = [
    observation.fields.name,
    ...(observation.aliases ?? []),
  ].filter((value): value is string => Boolean(value));
  for (const name of names)
    insertAlias.run(entityId, normalizedAlias(name), name);

  const writeProvenance = sqlite.prepare(`
    insert into fact_provenance (entity_id, field, source_run_id, source_record_key, citation_url, source_path, value_json)
    values (?, ?, ?, ?, ?, ?, ?)
    on conflict(entity_id, field, source_run_id) do update set
      source_record_key = excluded.source_record_key,
      citation_url = excluded.citation_url,
      source_path = excluded.source_path,
      value_json = excluded.value_json
  `);
  for (const field of [
    "name",
    "slug",
    "description",
    "arcaneClass",
    "weaponClass",
  ] as const) {
    if (observation.fields[field] !== undefined) {
      writeProvenance.run(
        entityId,
        field,
        sourceRunId,
        observation.evidence.sourceRecordKey,
        observation.evidence.citationUrl ?? null,
        observation.evidence.path ?? null,
        JSON.stringify(observation.fields[field]),
      );
    }
  }
  return entityId;
}

function updateWinningFields(
  sqlite: Database.Database,
  entityId: EntityId,
  observation: EntityObservation,
  sourcePriority: number,
): void {
  const updates: string[] = [];
  const values: unknown[] = [];
  const columns = {
    name: "name",
    slug: "slug",
    description: "description",
    arcaneClass: "arcane_class",
    weaponClass: "weapon_class",
  } as const;
  for (const field of [
    "name",
    "slug",
    "description",
    "arcaneClass",
    "weaponClass",
  ] as const) {
    const value = observation.fields[field];
    if (value === undefined) continue;
    const winner = sqlite
      .prepare(
        `
      select max(s.priority) as priority
      from fact_provenance p
      join source_runs r on r.id = p.source_run_id and r.status = 'active'
      join sources s on s.id = r.source_id
      where p.entity_id = ? and p.field = ?
    `,
      )
      .get(entityId, field) as { priority: number | null };
    if (winner.priority === null || sourcePriority >= winner.priority) {
      updates.push(`${columns[field]} = ?`);
      values.push(value);
    }
  }
  if (updates.length) {
    values.push(Date.now(), entityId);
    sqlite
      .prepare(
        `update entities set ${updates.join(", ")}, updated_at = ? where id = ?`,
      )
      .run(...values);
  }
}

function loadResolutionState(sqlite: Database.Database): ResolutionState {
  const entityRows = sqlite
    .prepare(
      "select id, kind, name, slug, description, arcane_class as arcaneClass, weapon_class as weaponClass, retired from entities",
    )
    .all() as Array<Omit<CanonicalEntity, "retired"> & { retired: number }>;
  const entities = new Map<EntityId, CanonicalEntity>();
  for (const row of entityRows)
    entities.set(row.id, { ...row, retired: Boolean(row.retired) });
  const externalIds = new Map<string, EntityId>();
  for (const row of sqlite
    .prepare(
      "select entity_id as entityId, source_id as sourceId, namespace, value from external_ids",
    )
    .all() as Array<{
    entityId: EntityId;
    sourceId: string;
    namespace: string;
    value: string;
  }>) {
    externalIds.set(externalKey(row), row.entityId);
  }
  for (const row of sqlite
    .prepare(
      "select entity_id as entityId, external_source_id as sourceId, namespace, value from entity_identity_overrides",
    )
    .all() as Array<{
    entityId: EntityId;
    sourceId: string;
    namespace: string;
    value: string;
  }>) {
    const key = externalKey(row);
    const canonical = externalIds.get(key);
    if (canonical && canonical !== row.entityId)
      throw new Error(
        "Identity override conflicts with a canonical external identifier",
      );
    externalIds.set(key, row.entityId);
  }
  const aliases = new Map<string, EntityId[]>();
  for (const row of sqlite
    .prepare("select entity_id as entityId, normalized from entity_aliases")
    .all() as Array<{ entityId: EntityId; normalized: string }>) {
    aliases.set(row.normalized, [
      ...(aliases.get(row.normalized) ?? []),
      row.entityId,
    ]);
  }
  return { entities, externalIds, aliases };
}

function indexObservation(
  state: ResolutionState,
  entityId: EntityId,
  observation: EntityObservation,
): void {
  for (const externalId of observation.externalIds)
    state.externalIds.set(externalKey(externalId), entityId);
  const names = [
    observation.fields.name,
    ...(observation.aliases ?? []),
  ].filter((value): value is string => Boolean(value));
  for (const name of names) {
    const normalized = normalizedAlias(name);
    const ids = state.aliases.get(normalized) ?? [];
    if (!ids.includes(entityId))
      state.aliases.set(normalized, [...ids, entityId]);
  }
}

function writeConflict(
  sqlite: Database.Database,
  sourceRunId: string,
  recordKey: string,
  reason: string,
  candidates: EntityId[],
  counts: { conflictsCreated: number },
  externalIds: ExternalIdentifier[] = [],
): void {
  sqlite
    .prepare(
      `
    insert into ingestion_conflicts (id, source_run_id, record_key, reason, candidates_json, external_ids_json)
    values (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      randomUUID(),
      sourceRunId,
      recordKey,
      reason,
      JSON.stringify(candidates),
      JSON.stringify(externalIds),
    );
  counts.conflictsCreated += 1;
}

function validateInput(input: PromoteSourceInput): void {
  if (
    !input.source.id ||
    !input.version ||
    !input.contentHash ||
    !input.observations.length
  ) {
    throw new Error("Promotion input is incomplete");
  }
  const retrievedAt = new Date(input.retrievedAt);
  if (Number.isNaN(retrievedAt.getTime()))
    throw new Error("Promotion retrievedAt is invalid");
  for (const observation of input.observations) {
    const evidenceRetrievedAt = new Date(observation.evidence.retrievedAt);
    if (
      observation.evidence.sourceId !== input.source.id ||
      observation.evidence.snapshotVersion !== input.version
    ) {
      throw new Error(
        "Observation evidence does not match the promoted source snapshot",
      );
    }
    if (!observation.evidence.sourceRecordKey.trim())
      throw new Error("Observation evidence source record key is required");
    if (
      Number.isNaN(evidenceRetrievedAt.getTime()) ||
      evidenceRetrievedAt.getTime() !== retrievedAt.getTime()
    ) {
      throw new Error(
        "Observation evidence retrieval time does not match the promoted source snapshot",
      );
    }
    if (
      observation.type === "drop" &&
      observation.chance !== undefined &&
      (observation.chance < 0 || observation.chance > 1)
    ) {
      throw new Error(`Drop chance is outside [0, 1]: ${observation.chance}`);
    }
    if (
      observation.type === "entity" &&
      observation.fields.arcaneClass !== undefined &&
      (observation.kind !== "arcane" ||
        !(ARCANE_CLASSES as readonly string[]).includes(
          observation.fields.arcaneClass,
        ))
    ) {
      throw new Error("Entity arcane class is invalid");
    }
    if (
      observation.type === "entity" &&
      observation.fields.weaponClass !== undefined &&
      (observation.kind !== "weapon" ||
        !(WEAPON_CLASSES as readonly string[]).includes(
          observation.fields.weaponClass,
        ))
    ) {
      throw new Error("Entity weapon class is invalid");
    }
    if (
      observation.type === "drop" &&
      (!Number.isInteger(observation.quantity ?? 1) ||
        (observation.quantity ?? 1) < 1)
    ) {
      throw new Error("Drop quantity must be a positive integer");
    }
    if (observation.type === "recipe") {
      if (
        !Number.isInteger(observation.outputQuantity ?? 1) ||
        (observation.outputQuantity ?? 1) < 1
      )
        throw new Error("Recipe output quantity must be a positive integer");
      if (
        observation.ingredients.some(
          (ingredient) =>
            !Number.isInteger(ingredient.quantity) || ingredient.quantity < 1,
        )
      )
        throw new Error(
          "Recipe ingredient quantities must be positive integers",
        );
    }
    if (observation.type === "ranking-set") {
      if (
        !observation.key ||
        !observation.title ||
        !observation.author ||
        !observation.scope ||
        !observation.licenseNote ||
        !observation.scale.length ||
        new Set(observation.scale).size !== observation.scale.length
      ) {
        throw new Error("Ranking set metadata or scale is invalid");
      }
      if (Number.isNaN(new Date(observation.publishedAt).getTime()))
        throw new Error("Ranking set publishedAt is invalid");
    }
    if (observation.type === "ranking") {
      if (!observation.setKey || !observation.tier)
        throw new Error("Ranking is incomplete");
      if (
        observation.position !== undefined &&
        (!Number.isInteger(observation.position) || observation.position < 1)
      )
        throw new Error("Ranking position must be a positive integer");
      if (
        observation.timestampSeconds !== undefined &&
        (!Number.isInteger(observation.timestampSeconds) ||
          observation.timestampSeconds < 0)
      )
        throw new Error("Ranking timestamp must be a non-negative integer");
    }
    if (observation.type === "node-detail") {
      if (!observation.planet)
        throw new Error("Node detail planet is required");
      for (const [label, value] of [
        ["minimum enemy level", observation.minimumEnemyLevel],
        ["maximum enemy level", observation.maximumEnemyLevel],
        ["mastery requirement", observation.masteryRequirement],
        ["node type", observation.nodeType],
      ] as const) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0))
          throw new Error(
            `Node detail ${label} must be a non-negative integer`,
          );
      }
      if (
        observation.minimumEnemyLevel !== undefined &&
        observation.maximumEnemyLevel !== undefined &&
        observation.maximumEnemyLevel < observation.minimumEnemyLevel
      )
        throw new Error("Node detail level range is inverted");
    }
  }
  validateCandidateSet(input.observations);
}

function validateCandidateSet(observations: Observation[]): void {
  const externalEntities = new Map<string, EntityObservation>();
  const slugs = new Map<string, EntityObservation>();
  const rankingSets = new Map<
    string,
    Extract<Observation, { type: "ranking-set" }>
  >();
  const uniqueFacts = new Map<string, Observation>();

  for (const observation of observations) {
    if (observation.type === "entity") {
      for (const externalId of observation.externalIds) {
        const key = externalKey(externalId);
        const prior = externalEntities.get(key);
        if (prior && incompatibleEntityDeclarations(prior, observation)) {
          throw new Error(
            `Candidate external identifier ${key} has conflicting entity declarations in ${prior.evidence.sourceRecordKey} and ${observation.evidence.sourceRecordKey}`,
          );
        }
        externalEntities.set(key, prior ?? observation);
      }
      if (observation.fields.slug) {
        const key = `${observation.kind}:${observation.fields.slug}`;
        const prior = slugs.get(key);
        if (
          prior?.fields.name &&
          observation.fields.name &&
          prior.fields.name !== observation.fields.name
        ) {
          throw new Error(
            `Candidate slug ${key} has conflicting names in ${prior.evidence.sourceRecordKey} and ${observation.evidence.sourceRecordKey}`,
          );
        }
        slugs.set(key, prior ?? observation);
      }
      continue;
    }
    if (observation.type === "ranking-set") {
      const prior = rankingSets.get(observation.key);
      if (prior)
        throw new Error(
          `Candidate ranking set ${observation.key} is declared more than once in ${prior.evidence.sourceRecordKey} and ${observation.evidence.sourceRecordKey}`,
        );
      rankingSets.set(observation.key, observation);
      continue;
    }
    let factKey: string | undefined;
    if (observation.type === "node-detail")
      factKey = `node-detail:${externalKey(observation.nodeExternalId)}`;
    if (observation.type === "enhancement-option")
      factKey = `enhancement-option:${externalKey(observation.subjectExternalId)}:${observation.key}`;
    if (factKey) {
      const prior = uniqueFacts.get(factKey);
      if (prior)
        throw new Error(
          `Candidate fact ${factKey} is declared more than once in ${prior.evidence.sourceRecordKey} and ${observation.evidence.sourceRecordKey}`,
        );
      uniqueFacts.set(factKey, observation);
    }
  }

  for (const observation of observations) {
    if (observation.type !== "ranking") continue;
    const set = rankingSets.get(observation.setKey);
    if (!set)
      throw new Error(
        `Candidate ranking ${observation.evidence.sourceRecordKey} refers to undeclared set ${observation.setKey}`,
      );
    if (!set.scale.includes(observation.tier))
      throw new Error(
        `Candidate ranking ${observation.evidence.sourceRecordKey} uses tier ${observation.tier} outside set ${observation.setKey}`,
      );
    const factKey = `ranking:${observation.setKey}:${externalKey(observation.subjectExternalId)}`;
    const prior = uniqueFacts.get(factKey);
    if (prior)
      throw new Error(
        `Candidate ranking member ${factKey} is declared more than once in ${prior.evidence.sourceRecordKey} and ${observation.evidence.sourceRecordKey}`,
      );
    uniqueFacts.set(factKey, observation);
  }
}

function incompatibleEntityDeclarations(
  first: EntityObservation,
  second: EntityObservation,
): boolean {
  if (
    first.kind !== second.kind &&
    first.kind !== "unknown" &&
    second.kind !== "unknown"
  )
    return true;
  for (const field of ["name", "slug", "arcaneClass", "weaponClass"] as const) {
    if (
      first.fields[field] !== undefined &&
      second.fields[field] !== undefined &&
      first.fields[field] !== second.fields[field]
    )
      return true;
  }
  return Boolean(first.tombstone) !== Boolean(second.tombstone);
}
