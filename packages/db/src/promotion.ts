import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ARCANE_CLASSES,
  ADVERSARY_KINDS,
  EQUIPMENT_KINDS,
  EQUIPMENT_POLARITY_ROLES,
  MOD_POLARITIES,
  MODULAR_PART_ROLES,
  WEAPON_CLASSES,
  externalKey,
  entityKindsCompatible,
  normalizedAlias,
  resolveEntity,
  type CanonicalEntity,
  type EntityId,
  type EntityKind,
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
  minimumRetainedObservationRatio?: number;
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
  nodeItemRequirementsCreated: number;
  nodeObjectivesCreated: number;
  nodeRewardsCreated: number;
  relationsCreated: number;
  enhancementOptionsCreated: number;
  equipmentPolaritySetsCreated: number;
  rankingSetsCreated: number;
  rankingsCreated: number;
  cyclicRewardSchedulesCreated: number;
  cyclicRewardChoicesCreated: number;
  relicRewardsCreated: number;
  vendorOfferingsCreated: number;
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
        nodeItemRequirementsCreated: 0,
        nodeObjectivesCreated: 0,
        nodeRewardsCreated: 0,
        relationsCreated: 0,
        enhancementOptionsCreated: 0,
        equipmentPolaritySetsCreated: 0,
        rankingSetsCreated: 0,
        rankingsCreated: 0,
        cyclicRewardSchedulesCreated: 0,
        cyclicRewardChoicesCreated: 0,
        relicRewardsCreated: 0,
        vendorOfferingsCreated: 0,
        conflictsCreated: 0,
      };
    }
    throw new Error(
      `Source version ${input.source.id}@${input.version} has already been imported and is not active`,
    );
  }

  const activeRun = sqlite
    .prepare(
      "select observation_count as observationCount from source_runs where source_id = ? and status = 'active'",
    )
    .get(input.source.id) as { observationCount: number | null } | undefined;
  if (
    input.minimumRetainedObservationRatio !== undefined &&
    activeRun?.observationCount !== null &&
    activeRun?.observationCount !== undefined
  ) {
    const minimum = Math.ceil(
      activeRun.observationCount * input.minimumRetainedObservationRatio,
    );
    if (input.observations.length < minimum)
      throw new Error(
        `Source ${input.source.id} produced ${input.observations.length} observations; minimum is ${minimum} from previous ${activeRun.observationCount}`,
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
    insert into source_runs (id, source_id, version, content_hash, retrieved_at, snapshot_path, observation_count, status)
    values (?, ?, ?, ?, ?, ?, ?, 'staged')
  `,
    )
    .run(
      sourceRunId,
      input.source.id,
      input.version,
      input.contentHash,
      retrievedAt.getTime(),
      input.snapshotPath ?? null,
      input.observations.length,
    );

  const state = loadResolutionState(sqlite);
  const counts = {
    entitiesCreated: 0,
    entitiesMatched: 0,
    recipesCreated: 0,
    dropsCreated: 0,
    nodeDetailsCreated: 0,
    nodeItemRequirementsCreated: 0,
    nodeObjectivesCreated: 0,
    nodeRewardsCreated: 0,
    relationsCreated: 0,
    enhancementOptionsCreated: 0,
    equipmentPolaritySetsCreated: 0,
    rankingSetsCreated: 0,
    rankingsCreated: 0,
    cyclicRewardSchedulesCreated: 0,
    cyclicRewardChoicesCreated: 0,
    relicRewardsCreated: 0,
    vendorOfferingsCreated: 0,
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
  const cyclicRewardSchedules = new Map<
    string,
    { id: string; phaseCount: number }
  >();
  for (const observation of input.observations) {
    if (observation.type !== "cyclic-reward-schedule") continue;
    const id = randomUUID();
    sqlite
      .prepare(
        `insert into cyclic_reward_schedules
          (id, key, label, epoch, interval_seconds, phase_count, choices_per_phase,
           selections_allowed, instructions, source_run_id, source_record_key,
           citation_url, source_path)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        observation.key,
        observation.label,
        Date.parse(observation.epoch),
        observation.intervalSeconds,
        observation.phaseCount,
        observation.choicesPerPhase,
        observation.selectionsAllowed,
        observation.instructions,
        sourceRunId,
        observation.evidence.sourceRecordKey,
        observation.evidence.citationUrl ?? null,
        observation.evidence.path ?? null,
      );
    cyclicRewardSchedules.set(observation.key, {
      id,
      phaseCount: observation.phaseCount,
    });
    counts.cyclicRewardSchedulesCreated += 1;
  }
  for (const observation of input.observations) {
    if (observation.type !== "cyclic-reward-choice") continue;
    const schedule = cyclicRewardSchedules.get(observation.scheduleKey);
    if (!schedule) continue;
    const primaryResolution = resolveCyclicRewardSubject(
      sqlite,
      state,
      observation.primary,
    );
    if (!primaryResolution.entityId && primaryResolution.candidates.length)
      writeCyclicRewardConflict(
        sqlite,
        sourceRunId,
        observation.evidence.sourceRecordKey,
        observation.primary,
        primaryResolution.candidates,
        counts,
      );
    const includedRewards = (observation.includedRewards ?? []).map(
      (reward) => {
        const resolution = resolveCyclicRewardSubject(sqlite, state, reward);
        if (!resolution.entityId && resolution.candidates.length)
          writeCyclicRewardConflict(
            sqlite,
            sourceRunId,
            observation.evidence.sourceRecordKey,
            reward,
            resolution.candidates,
            counts,
          );
        return {
          label: reward.label,
          tier: reward.tier,
          entityId: resolution.entityId,
        };
      },
    );
    sqlite
      .prepare(
        `insert into cyclic_reward_choices
          (id, schedule_id, phase_index, phase_label, position, primary_entity_id,
           primary_label, acquisition_mode, included_rewards_json,
           source_record_key, citation_url, source_path)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        schedule.id,
        observation.phaseIndex,
        observation.phaseLabel,
        observation.position,
        primaryResolution.entityId ?? null,
        observation.primary.label,
        observation.acquisitionMode,
        JSON.stringify(includedRewards),
        observation.evidence.sourceRecordKey,
        observation.evidence.citationUrl ?? null,
        observation.evidence.path ?? null,
      );
    counts.cyclicRewardChoicesCreated += 1;
  }
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
    if (observation.type === "relic-reward") {
      if (
        !Number.isFinite(observation.chance) ||
        observation.chance <= 0 ||
        observation.chance > 1
      )
        throw new Error(
          "Relic reward chance must be greater than zero and at most one",
        );
      const relicId = state.externalIds.get(
        externalKey(observation.relicExternalId),
      );
      const rewardId = state.externalIds.get(
        externalKey(observation.rewardExternalId),
      );
      if (!relicId || !rewardId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Relic reward refers to an unresolved entity",
          [relicId, rewardId].filter((id): id is EntityId => Boolean(id)),
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `insert into relic_rewards
            (id, relic_id, reward_id, refinement, rarity, chance, source_run_id,
             source_record_key, citation_url, source_path)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          relicId,
          rewardId,
          observation.refinement,
          observation.rarity,
          observation.chance,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.relicRewardsCreated += 1;
    }
    if (observation.type === "vendor-offering") {
      if (
        !Number.isSafeInteger(observation.cost) ||
        observation.cost < 1 ||
        !Number.isSafeInteger(observation.quantity) ||
        observation.quantity < 1
      )
        throw new Error(
          "Vendor offering cost and quantity must be positive integers",
        );
      const vendorId = state.externalIds.get(
        externalKey(observation.vendorExternalId),
      );
      const itemId = state.externalIds.get(
        externalKey(observation.itemExternalId),
      );
      if (!vendorId || !itemId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Vendor offering refers to an unresolved entity",
          [vendorId, itemId].filter((id): id is EntityId => Boolean(id)),
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `insert into vendor_offerings
            (id, vendor_id, item_id, faction, currency, cost, quantity,
             prerequisite_rank, prerequisite_label, source_run_id,
             source_record_key, citation_url, source_path)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          vendorId,
          itemId,
          observation.faction,
          observation.currency,
          observation.cost,
          observation.quantity,
          observation.prerequisiteRank ?? null,
          observation.prerequisiteLabel ?? null,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.vendorOfferingsCreated += 1;
    }
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
    if (observation.type === "node-reward") {
      const nodeId = state.externalIds.get(
        externalKey(observation.nodeExternalId),
      );
      const rewardEntityId = observation.rewardExternalId
        ? state.externalIds.get(externalKey(observation.rewardExternalId))
        : undefined;
      if (!nodeId || (observation.rewardExternalId && !rewardEntityId)) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Node reward refers to an unresolved entity",
          [nodeId, rewardEntityId].filter((id): id is EntityId => Boolean(id)),
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `insert into node_rewards
            (id, node_id, reward_entity_id, key, label, quantity, trigger,
             objective_key, sort_order, source_run_id, source_record_key,
             citation_url, source_path)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          nodeId,
          rewardEntityId ?? null,
          observation.key,
          observation.label,
          observation.quantity ?? null,
          observation.trigger,
          observation.objectiveKey ?? null,
          observation.sortOrder,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.nodeRewardsCreated += 1;
    }
    if (observation.type === "node-objective") {
      const nodeId = state.externalIds.get(
        externalKey(observation.nodeExternalId),
      );
      if (!nodeId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Node objective refers to an unresolved entity",
          [],
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `insert into node_objectives
            (id, node_id, key, label, hint, sort_order, source_run_id,
             source_record_key, citation_url, source_path)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          nodeId,
          observation.key,
          observation.label,
          observation.hint ?? null,
          observation.sortOrder,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.nodeObjectivesCreated += 1;
    }
    if (observation.type === "node-item-requirement") {
      const nodeId = state.externalIds.get(
        externalKey(observation.nodeExternalId),
      );
      const itemId = state.externalIds.get(
        externalKey(observation.itemExternalId),
      );
      if (!nodeId || !itemId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Node item requirement refers to an unresolved entity",
          [nodeId, itemId].filter((id): id is EntityId => Boolean(id)),
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `insert into node_item_requirements
            (id, node_id, item_id, quantity, source_run_id, source_record_key, citation_url, source_path)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          nodeId,
          itemId,
          observation.quantity,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.nodeItemRequirementsCreated += 1;
    }
    if (observation.type === "equipment-polarity-set") {
      const entityId = state.externalIds.get(
        externalKey(observation.subjectExternalId),
      );
      if (!entityId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Equipment polarity set refers to an unresolved entity",
          [],
          counts,
        );
        continue;
      }
      sqlite
        .prepare(
          `
        insert into equipment_polarity_sets
          (id, entity_id, configuration, polarities_json, source_run_id, source_record_key, citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          randomUUID(),
          entityId,
          observation.configuration ?? null,
          JSON.stringify(observation.polarities),
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.equipmentPolaritySetsCreated += 1;
    }
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
    if (observation.type === "entity-attribute") {
      const entityId = state.externalIds.get(
        externalKey(observation.subjectExternalId),
      );
      if (!entityId) {
        writeConflict(
          sqlite,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          "Entity attribute refers to an unresolved entity",
          [],
          counts,
        );
        continue;
      }
      const insertAttribute = sqlite.prepare(
        `insert into entity_attributes
            (id, entity_id, key, label, value, source_run_id, source_record_key, citation_url, source_path)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      try {
        insertAttribute.run(
          randomUUID(),
          entityId,
          observation.key,
          observation.label,
          observation.value,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      } catch (error) {
        throw new Error(
          `Could not store ${observation.key} for ${observation.evidence.sourceRecordKey} on entity ${entityId}`,
          { cause: error },
        );
      }
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
           mastery_requirement, railjack_intrinsic_requirement, warframe_rank_requirement,
           active_adversary_requirement, node_type, source_run_id, source_record_key,
           citation_url, source_path)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          observation.railjackIntrinsicRequirement ?? null,
          observation.warframeRankRequirement ?? null,
          observation.activeAdversaryRequirement ?? null,
          observation.nodeType ?? null,
          sourceRunId,
          observation.evidence.sourceRecordKey,
          observation.evidence.citationUrl ?? null,
          observation.evidence.path ?? null,
        );
      counts.nodeDetailsCreated += 1;
    }
    if (
      observation.type === "node-item-requirement" &&
      (!Number.isSafeInteger(observation.quantity) || observation.quantity < 1)
    )
      throw new Error(
        "Node item requirement quantity must be a positive safe integer",
      );
    if (observation.type === "node-objective") {
      if (!observation.key || !observation.label)
        throw new Error("Node objective key and label are required");
      if (
        !Number.isSafeInteger(observation.sortOrder) ||
        observation.sortOrder < 0
      )
        throw new Error(
          "Node objective sort order must be a non-negative integer",
        );
    }
    if (observation.type === "node-reward") {
      if (!observation.key || !observation.label)
        throw new Error("Node reward key and label are required");
      if (
        observation.trigger !== "objective" &&
        observation.trigger !== "junction-completion"
      )
        throw new Error("Node reward trigger is invalid");
      if (
        !Number.isSafeInteger(observation.sortOrder) ||
        observation.sortOrder < 0
      )
        throw new Error(
          "Node reward sort order must be a non-negative integer",
        );
      if (
        observation.quantity !== undefined &&
        (!Number.isSafeInteger(observation.quantity) ||
          observation.quantity <= 0)
      )
        throw new Error("Node reward quantity must be a positive safe integer");
      if (
        (observation.trigger === "objective") !==
        Boolean(observation.objectiveKey)
      )
        throw new Error(
          "Objective node rewards require exactly one objective key",
        );
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
    if (
      observation.type === "equipment-polarity-set" &&
      ((observation.configuration !== undefined &&
        (!observation.configuration.trim() ||
          observation.configuration.length > 120)) ||
        observation.polarities.length > 20 ||
        new Set(
          observation.polarities.map(
            ({ role, polarity }) => `${role}:${polarity}`,
          ),
        ).size !== observation.polarities.length ||
        observation.polarities.some(
          ({ role, polarity, quantity }) =>
            !(EQUIPMENT_POLARITY_ROLES as readonly string[]).includes(role) ||
            !(MOD_POLARITIES as readonly string[]).includes(polarity) ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > 20,
        ) ||
        observation.polarities.reduce(
          (total, polarity) => total + polarity.quantity,
          0,
        ) > 20)
    )
      throw new Error("Equipment polarity set is invalid");
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
        select 'node item requirement node', requirement.source_record_key, requirement.node_id
          from node_item_requirements requirement join source_runs run on run.id = requirement.source_run_id and run.status = 'active'
        union all
        select 'node item requirement item', requirement.source_record_key, requirement.item_id
          from node_item_requirements requirement join source_runs run on run.id = requirement.source_run_id and run.status = 'active'
        union all
        select 'node objective', objective.source_record_key, objective.node_id
          from node_objectives objective join source_runs run on run.id = objective.source_run_id and run.status = 'active'
        union all
        select 'node reward node', reward.source_record_key, reward.node_id
          from node_rewards reward join source_runs run on run.id = reward.source_run_id and run.status = 'active'
        union all
        select 'node reward entity', reward.source_record_key, reward.reward_entity_id
          from node_rewards reward join source_runs run on run.id = reward.source_run_id and run.status = 'active'
          where reward.reward_entity_id is not null
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
        select 'equipment polarity set', polarity.source_record_key, polarity.entity_id
          from equipment_polarity_sets polarity join source_runs run on run.id = polarity.source_run_id and run.status = 'active'
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
        select 'node item requirement', requirement.source_record_key, entity.kind, entity.slug
          from node_item_requirements requirement join source_runs run on run.id = requirement.source_run_id and run.status = 'active'
          join entities entity on entity.id = requirement.node_id where entity.kind != 'node'
        union all
        select 'node objective', objective.source_record_key, entity.kind, entity.slug
          from node_objectives objective join source_runs run on run.id = objective.source_run_id and run.status = 'active'
          join entities entity on entity.id = objective.node_id where entity.kind != 'node'
        union all
        select 'node reward', reward.source_record_key, entity.kind, entity.slug
          from node_rewards reward join source_runs run on run.id = reward.source_run_id and run.status = 'active'
          join entities entity on entity.id = reward.node_id where entity.kind != 'node'
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

  const missingRewardObjective = sqlite
    .prepare(
      `select reward.source_record_key as recordKey
       from node_rewards reward
       join source_runs run
         on run.id = reward.source_run_id and run.status = 'active'
       left join node_objectives objective
         on objective.source_run_id = reward.source_run_id
        and objective.node_id = reward.node_id
        and objective.key = reward.objective_key
       where reward.trigger = 'objective' and objective.id is null limit 1`,
    )
    .get() as { recordKey: string } | undefined;
  if (missingRewardObjective)
    throw new Error(
      `Composed catalog node reward ${missingRewardObjective.recordKey} refers to a missing objective`,
    );

  const invalidNodeItemRequirement = sqlite
    .prepare(
      `select requirement.source_record_key as recordKey, entity.kind, entity.slug
       from node_item_requirements requirement
       join source_runs run on run.id = requirement.source_run_id and run.status = 'active'
       join entities entity on entity.id = requirement.item_id
       where entity.kind not in ('resource', 'component', 'blueprint') limit 1`,
    )
    .get() as { recordKey: string; kind: string; slug: string } | undefined;
  if (invalidNodeItemRequirement)
    throw new Error(
      `Composed catalog node item requirement ${invalidNodeItemRequirement.recordKey} requires an inventory item but resolved ${invalidNodeItemRequirement.kind}:${invalidNodeItemRequirement.slug}`,
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

  const invalidEquipmentPolaritySubject = sqlite
    .prepare(
      `select polarity.source_record_key as recordKey, entity.kind, entity.slug
       from equipment_polarity_sets polarity
       join source_runs run on run.id = polarity.source_run_id and run.status = 'active'
       join entities entity on entity.id = polarity.entity_id
       where entity.kind not in ('warframe', 'weapon', 'companion', 'archwing') limit 1`,
    )
    .get() as { recordKey: string; kind: string; slug: string } | undefined;
  if (invalidEquipmentPolaritySubject)
    throw new Error(
      `Composed catalog equipment polarity set ${invalidEquipmentPolaritySubject.recordKey} requires equipment but resolved ${invalidEquipmentPolaritySubject.kind}:${invalidEquipmentPolaritySubject.slug}`,
    );

  validateAcyclicRecipes(sqlite);
}

function validateAcyclicRecipes(sqlite: Database.Database): void {
  const edges = sqlite
    .prepare(
      `select recipe.output_id as outputId, ingredient.entity_id as ingredientId
       from recipes recipe
       join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
       join recipe_ingredients ingredient on ingredient.recipe_id = recipe.id`,
    )
    .all() as Array<{ outputId: string; ingredientId: string }>;
  const adjacency = new Map<string, Set<string>>();
  for (const { outputId, ingredientId } of edges) {
    const ingredients = adjacency.get(outputId) ?? new Set<string>();
    ingredients.add(ingredientId);
    adjacency.set(outputId, ingredients);
  }
  const state = new Map<string, "visiting" | "visited">();
  let cycleEntityId: string | undefined;
  for (const start of adjacency.keys()) {
    if (state.has(start)) continue;
    state.set(start, "visiting");
    const stack = [
      { node: start, ingredients: [...(adjacency.get(start) ?? [])], index: 0 },
    ];
    while (stack.length && !cycleEntityId) {
      const frame = stack.at(-1)!;
      const ingredient = frame.ingredients[frame.index];
      if (ingredient === undefined) {
        state.set(frame.node, "visited");
        stack.pop();
        continue;
      }
      frame.index += 1;
      if (state.get(ingredient) === "visiting") {
        cycleEntityId = ingredient;
        break;
      }
      if (state.has(ingredient) || !adjacency.has(ingredient)) continue;
      state.set(ingredient, "visiting");
      stack.push({
        node: ingredient,
        ingredients: [...(adjacency.get(ingredient) ?? [])],
        index: 0,
      });
    }
    if (cycleEntityId) break;
  }
  if (!cycleEntityId) return;
  const entity = sqlite
    .prepare("select kind, slug from entities where id = ?")
    .get(cycleEntityId) as { kind: string; slug: string };
  throw new Error(
    `Composed catalog recipe graph contains a cycle at ${entity.kind}:${entity.slug}`,
  );
}

function recomputeActiveEntityFields(sqlite: Database.Database): void {
  const columns = {
    name: "name",
    slug: "slug",
    description: "description",
    arcaneClass: "arcane_class",
    weaponClass: "weapon_class",
    modularPartRole: "modular_part_role",
    equipmentMaxRank: "equipment_max_rank",
    modMaxRank: "mod_max_rank",
    modBaseDrain: "mod_base_drain",
    modPolarity: "mod_polarity",
  } as const;
  const winners = sqlite
    .prepare(
      `with ranked as (
        select provenance.entity_id as entityId, provenance.field, provenance.value_json as valueJson,
          row_number() over (
            partition by provenance.entity_id, provenance.field
            order by source.priority desc, run.retrieved_at desc, source.id
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
  const updates = new Map<
    string,
    Array<{ column: string; value: string | number }>
  >();
  for (const winner of winners) {
    if (!(winner.field in columns)) continue;
    const value: unknown = JSON.parse(winner.valueJson);
    const numeric =
      winner.field === "equipmentMaxRank" ||
      winner.field === "modMaxRank" ||
      winner.field === "modBaseDrain";
    if (
      (numeric && !Number.isSafeInteger(value)) ||
      (!numeric && typeof value !== "string")
    )
      throw new Error(
        `Stored entity field ${winner.field} for ${winner.entityId} is invalid`,
      );
    const fields = updates.get(winner.entityId) ?? [];
    fields.push({
      column: columns[winner.field],
      value: value as string | number,
    });
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
    ["modularPartRole", "modular_part_role"],
    ["equipmentMaxRank", "equipment_max_rank"],
    ["modMaxRank", "mod_max_rank"],
    ["modBaseDrain", "mod_base_drain"],
    ["modPolarity", "mod_polarity"],
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
  let resolution = resolveEntity(observation, state);
  if (resolution.status === "conflict")
    resolution = repairExplicitProviderBridge(
      sqlite,
      state,
      observation,
      resolution.candidateIds,
    );
  if (resolution.status === "matched" && resolution.by === "external-id")
    resolution = repairExactProviderIdentity(
      sqlite,
      state,
      observation,
      resolution.entityId,
    );
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
      insert into entities (id, kind, name, slug, description, arcane_class, weapon_class, modular_part_role, equipment_max_rank, mod_max_rank, mod_base_drain, mod_polarity, retired, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        observation.fields.modularPartRole ?? null,
        observation.fields.equipmentMaxRank ?? null,
        observation.fields.modMaxRank ?? null,
        observation.fields.modBaseDrain ?? null,
        observation.fields.modPolarity ?? null,
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
      modularPartRole: observation.fields.modularPartRole,
      equipmentMaxRank: observation.fields.equipmentMaxRank,
      modMaxRank: observation.fields.modMaxRank,
      modBaseDrain: observation.fields.modBaseDrain,
      modPolarity: observation.fields.modPolarity,
      retired: observation.tombstone ?? false,
    });
    counts.entitiesCreated += 1;
  } else {
    entityId = resolution.entityId;
    const entity = state.entities.get(entityId)!;
    const modularComponentReclassification =
      entity.kind === "weapon" &&
      observation.kind === "component" &&
      observation.fields.modularPartRole !== undefined &&
      ["kitgun-grip", "kitgun-loader", "zaw-grip", "zaw-link"].includes(
        observation.fields.modularPartRole,
      );
    if (
      observation.kind !== "unknown" &&
      !entityKindsCompatible(entity.kind, observation.kind) &&
      !modularComponentReclassification
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
    if (
      (entity.kind === "unknown" && observation.kind !== "unknown") ||
      (entity.kind === "enemy" && observation.kind === "boss") ||
      modularComponentReclassification
    ) {
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
    "modularPartRole",
    "equipmentMaxRank",
    "modMaxRank",
    "modBaseDrain",
    "modPolarity",
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

/**
 * A WFCD drop snapshot can explicitly assert both its historical reward ID and
 * the canonical warframe-items ID. That assertion is stronger than a name
 * match and lets us retire the old reward-only shell without merging arbitrary
 * same-name entities from unrelated providers.
 */
function repairExplicitProviderBridge(
  sqlite: Database.Database,
  state: ResolutionState,
  observation: EntityObservation,
  candidateIds: EntityId[],
): ReturnType<typeof resolveEntity> {
  const relicRepair = repairLegacyRelicRefinementBridge(
    sqlite,
    state,
    observation,
    candidateIds,
  );
  if (relicRepair) return relicRepair;
  const itemIdentifiers = observation.externalIds.filter(
    ({ sourceId, namespace }) =>
      sourceId === "wfcd-items" && namespace === "uniqueName",
  );
  const dropIdentifiers = observation.externalIds.filter(
    ({ sourceId, namespace }) =>
      sourceId === "wfcd-drops" && namespace === "reward",
  );
  if (
    observation.evidence.sourceId !== "wfcd-drops" ||
    itemIdentifiers.length < 1 ||
    dropIdentifiers.length !== 1
  )
    return { status: "conflict", candidateIds };

  const itemTargetIds = new Set(
    itemIdentifiers.map((identifier) =>
      state.externalIds.get(externalKey(identifier)),
    ),
  );
  itemTargetIds.delete(undefined);
  const targetId = itemTargetIds.size === 1 ? [...itemTargetIds][0] : undefined;
  const legacyId = state.externalIds.get(externalKey(dropIdentifiers[0]!));
  if (
    !targetId ||
    !legacyId ||
    targetId === legacyId ||
    !candidateIds.includes(targetId) ||
    !candidateIds.includes(legacyId) ||
    state.entities.get(targetId)?.kind !== observation.kind
  )
    return { status: "conflict", candidateIds };

  const legacyIdentifiers = sqlite
    .prepare(
      "select source_id as sourceId, namespace, value from external_ids where entity_id = ?",
    )
    .all(legacyId) as ExternalIdentifier[];
  if (
    !legacyIdentifiers.some(
      (identifier) =>
        externalKey(identifier) === externalKey(dropIdentifiers[0]!),
    )
  )
    return { status: "conflict", candidateIds };

  const moveIdentifier = sqlite.prepare(
    "update external_ids set entity_id = ? where source_id = ? and namespace = ? and value = ? and entity_id = ?",
  );
  for (const identifier of legacyIdentifiers) {
    moveIdentifier.run(
      targetId,
      identifier.sourceId,
      identifier.namespace,
      identifier.value,
      legacyId,
    );
    state.externalIds.set(externalKey(identifier), targetId);
  }
  migratePrivateEntityReferences(sqlite, legacyId, targetId);
  sqlite
    .prepare("update entities set retired = 1, updated_at = ? where id = ?")
    .run(Date.now(), legacyId);
  const legacy = state.entities.get(legacyId);
  if (legacy) state.entities.set(legacyId, { ...legacy, retired: true });
  return { status: "matched", entityId: targetId, by: "external-id" };
}

function repairLegacyRelicRefinementBridge(
  sqlite: Database.Database,
  state: ResolutionState,
  observation: EntityObservation,
  candidateIds: EntityId[],
): ReturnType<typeof resolveEntity> | undefined {
  if (
    observation.evidence.sourceId !== "wfcd-items" ||
    observation.kind !== "relic"
  )
    return;
  const identifiers = observation.externalIds.filter(
    ({ sourceId, namespace }) =>
      sourceId === "wfcd-items" && namespace === "uniqueName",
  );
  const base = identifiers.find(
    ({ value }) => !/(Bronze|Silver|Gold|Platinum)$/.test(value),
  );
  const refinement = identifiers.find(({ value }) =>
    /(Bronze|Silver|Gold|Platinum)$/.test(value),
  );
  if (!base || !refinement) return;
  const targetId = state.externalIds.get(externalKey(base));
  const legacyId = state.externalIds.get(externalKey(refinement));
  if (
    !targetId ||
    !legacyId ||
    targetId === legacyId ||
    !candidateIds.includes(targetId) ||
    !candidateIds.includes(legacyId) ||
    state.entities.get(targetId)?.kind !== "relic" ||
    state.entities.get(legacyId)?.kind !== "relic"
  )
    return;

  sqlite
    .prepare(
      `update external_ids set entity_id = ?
       where source_id = ? and namespace = ? and value = ? and entity_id = ?`,
    )
    .run(
      targetId,
      refinement.sourceId,
      refinement.namespace,
      refinement.value,
      legacyId,
    );
  state.externalIds.set(externalKey(refinement), targetId);
  migratePrivateEntityReferences(sqlite, legacyId, targetId);
  const remaining = (
    sqlite
      .prepare("select count(*) as count from external_ids where entity_id = ?")
      .get(legacyId) as { count: number }
  ).count;
  if (remaining === 0) {
    sqlite
      .prepare("update entities set retired = 1, updated_at = ? where id = ?")
      .run(Date.now(), legacyId);
    const legacy = state.entities.get(legacyId);
    if (legacy) state.entities.set(legacyId, { ...legacy, retired: true });
  }
  return { status: "matched", entityId: targetId, by: "external-id" };
}

function repairExactProviderIdentity(
  sqlite: Database.Database,
  state: ResolutionState,
  observation: EntityObservation,
  matchedEntityId: EntityId,
): ReturnType<typeof resolveEntity> {
  const entity = state.entities.get(matchedEntityId)!;
  const matchedExternalIds = observation.externalIds.filter(
    (externalId) =>
      externalId.sourceId === observation.evidence.sourceId &&
      state.externalIds.get(externalKey(externalId)) === matchedEntityId,
  );
  const legacyMarketGrouping =
    observation.evidence.sourceId === "warframe-market-items" &&
    observation.fields.name !== undefined &&
    normalizedAlias(observation.fields.name) !== normalizedAlias(entity.name) &&
    (
      sqlite
        .prepare(
          `select count(*) as count from external_ids
           where entity_id = ? and source_id = 'warframe-market-items'
             and namespace = 'item-id'`,
        )
        .get(matchedEntityId) as { count: number }
    ).count >
      matchedExternalIds.filter(({ namespace }) => namespace === "item-id")
        .length;
  if (legacyMarketGrouping && matchedExternalIds.length) {
    for (const externalId of matchedExternalIds)
      state.externalIds.delete(externalKey(externalId));
    const splitResolution = resolveEntity(observation, state);
    if (
      splitResolution.status === "conflict" ||
      (splitResolution.status === "matched" &&
        splitResolution.entityId === matchedEntityId)
    ) {
      for (const externalId of matchedExternalIds)
        state.externalIds.set(externalKey(externalId), matchedEntityId);
      return splitResolution.status === "conflict"
        ? splitResolution
        : { status: "matched", entityId: matchedEntityId, by: "external-id" };
    }
    for (const externalId of matchedExternalIds)
      sqlite
        .prepare(
          "delete from external_ids where source_id = ? and namespace = ? and value = ? and entity_id = ?",
        )
        .run(
          externalId.sourceId,
          externalId.namespace,
          externalId.value,
          matchedEntityId,
        );
    return splitResolution;
  }
  if (
    observation.kind === "unknown" ||
    (entity.kind !== "unknown" &&
      entityKindsCompatible(entity.kind, observation.kind))
  )
    return {
      status: "matched",
      entityId: matchedEntityId,
      by: "external-id",
    };

  if (!matchedExternalIds.length)
    return {
      status: "matched",
      entityId: matchedEntityId,
      by: "external-id",
    };

  const identifierCount = (
    sqlite
      .prepare("select count(*) as count from external_ids where entity_id = ?")
      .get(matchedEntityId) as { count: number }
  ).count;
  if (identifierCount > matchedExternalIds.length) {
    for (const externalId of matchedExternalIds) {
      state.externalIds.delete(externalKey(externalId));
    }
    const splitResolution = resolveEntity(observation, state);
    if (splitResolution.status === "conflict") {
      for (const externalId of matchedExternalIds)
        state.externalIds.set(externalKey(externalId), matchedEntityId);
      return splitResolution;
    }
    for (const externalId of matchedExternalIds)
      sqlite
        .prepare(
          "delete from external_ids where source_id = ? and namespace = ? and value = ? and entity_id = ?",
        )
        .run(
          externalId.sourceId,
          externalId.namespace,
          externalId.value,
          matchedEntityId,
        );
    return splitResolution;
  }

  const targetIds = new Set(
    [observation.fields.name, ...(observation.aliases ?? [])].flatMap((name) =>
      name
        ? (state.aliases.get(normalizedAlias(name)) ?? []).filter(
            (entityId) =>
              entityId !== matchedEntityId &&
              state.entities.get(entityId)?.kind === observation.kind,
          )
        : [],
    ),
  );
  if (targetIds.size === 1) {
    const targetId = [...targetIds][0]!;
    for (const externalId of matchedExternalIds) {
      sqlite
        .prepare(
          "update external_ids set entity_id = ? where source_id = ? and namespace = ? and value = ? and entity_id = ?",
        )
        .run(
          targetId,
          externalId.sourceId,
          externalId.namespace,
          externalId.value,
          matchedEntityId,
        );
      state.externalIds.set(externalKey(externalId), targetId);
    }
    migratePrivateEntityReferences(sqlite, matchedEntityId, targetId);
    sqlite
      .prepare(
        "update entities set retired = 1, updated_at = ? where id = ? and not exists (select 1 from external_ids where entity_id = ?)",
      )
      .run(Date.now(), matchedEntityId, matchedEntityId);
    return { status: "matched", entityId: targetId, by: "alias" };
  }
  if (targetIds.size > 1)
    return {
      status: "conflict",
      candidateIds: [...targetIds],
    };

  sqlite
    .prepare("update entities set kind = ?, updated_at = ? where id = ?")
    .run(observation.kind, Date.now(), matchedEntityId);
  state.entities.set(matchedEntityId, {
    ...entity,
    kind: observation.kind,
  });
  return {
    status: "matched",
    entityId: matchedEntityId,
    by: "external-id",
  };
}

function migratePrivateEntityReferences(
  sqlite: Database.Database,
  sourceId: EntityId,
  targetId: EntityId,
): void {
  // Provider identity repairs also have to carry independently sourced catalog
  // facts. Otherwise the old shell cannot be retired without invalidating the
  // composed release (junction rewards are the common case).
  sqlite
    .prepare(
      "update node_rewards set reward_entity_id = ? where reward_entity_id = ?",
    )
    .run(targetId, sourceId);
  sqlite
    .prepare("update drops set reward_id = ? where reward_id = ?")
    .run(targetId, sourceId);
  sqlite
    .prepare(
      "update entity_relations set from_entity_id = ? where from_entity_id = ?",
    )
    .run(targetId, sourceId);
  sqlite
    .prepare(
      "update entity_relations set to_entity_id = ? where to_entity_id = ?",
    )
    .run(targetId, sourceId);

  sqlite
    .prepare(
      `
      insert into player_inventory (
        user_id, entity_id, owned_count, built_count, wanted_count,
        mastered, subsumed, note, updated_at
      )
      select user_id, ?, owned_count, built_count, wanted_count,
        mastered, subsumed, note, updated_at
      from player_inventory where entity_id = ?
      on conflict(user_id, entity_id) do update set
        owned_count = max(player_inventory.owned_count, excluded.owned_count),
        built_count = max(player_inventory.built_count, excluded.built_count),
        wanted_count = max(player_inventory.wanted_count, excluded.wanted_count),
        mastered = case
          when player_inventory.mastered = 1 or excluded.mastered = 1 then 1
          when player_inventory.mastered = 0 or excluded.mastered = 0 then 0
          else null
        end,
        subsumed = case
          when player_inventory.subsumed = 1 or excluded.subsumed = 1 then 1
          when player_inventory.subsumed = 0 or excluded.subsumed = 0 then 0
          else null
        end,
        note = coalesce(player_inventory.note, excluded.note),
        updated_at = max(player_inventory.updated_at, excluded.updated_at)
    `,
    )
    .run(targetId, sourceId);
  sqlite
    .prepare("delete from player_inventory where entity_id = ?")
    .run(sourceId);

  sqlite
    .prepare(
      `
      insert into player_goals (
        user_id, entity_id, target_quantity, created_at, updated_at
      )
      select user_id, ?, target_quantity, created_at, updated_at
      from player_goals where entity_id = ?
      on conflict(user_id, entity_id) do update set
        target_quantity = max(player_goals.target_quantity, excluded.target_quantity),
        created_at = min(player_goals.created_at, excluded.created_at),
        updated_at = max(player_goals.updated_at, excluded.updated_at)
    `,
    )
    .run(targetId, sourceId);
  sqlite.prepare("delete from player_goals where entity_id = ?").run(sourceId);
  sqlite
    .prepare("update player_todos set entity_id = ? where entity_id = ?")
    .run(targetId, sourceId);
  sqlite
    .prepare("update world_state_watches set entity_id = ? where entity_id = ?")
    .run(targetId, sourceId);
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
    modularPartRole: "modular_part_role",
    equipmentMaxRank: "equipment_max_rank",
    modMaxRank: "mod_max_rank",
    modBaseDrain: "mod_base_drain",
    modPolarity: "mod_polarity",
  } as const;
  for (const field of [
    "name",
    "slug",
    "description",
    "arcaneClass",
    "weaponClass",
    "modularPartRole",
    "equipmentMaxRank",
    "modMaxRank",
    "modBaseDrain",
    "modPolarity",
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
    try {
      sqlite
        .prepare(
          `update entities set ${updates.join(", ")}, updated_at = ? where id = ?`,
        )
        .run(...values);
    } catch (error) {
      throw new Error(
        `Could not update canonical entity ${entityId} from ${observation.evidence.sourceRecordKey} to ${observation.kind}:${observation.fields.slug ?? "its existing slug"}`,
        { cause: error },
      );
    }
  }
}

function loadResolutionState(sqlite: Database.Database): ResolutionState {
  const entityRows = sqlite
    .prepare(
      "select id, kind, name, slug, description, arcane_class as arcaneClass, weapon_class as weaponClass, modular_part_role as modularPartRole, equipment_max_rank as equipmentMaxRank, mod_max_rank as modMaxRank, mod_base_drain as modBaseDrain, mod_polarity as modPolarity, retired from entities",
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
  if (
    input.minimumRetainedObservationRatio !== undefined &&
    (!Number.isFinite(input.minimumRetainedObservationRatio) ||
      input.minimumRetainedObservationRatio < 0 ||
      input.minimumRetainedObservationRatio > 1)
  )
    throw new Error(
      "Minimum retained observation ratio must be between 0 and 1",
    );
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
      observation.type === "entity" &&
      observation.fields.modularPartRole !== undefined &&
      (!(MODULAR_PART_ROLES as readonly string[]).includes(
        observation.fields.modularPartRole,
      ) ||
        ((["kitgun-chamber", "zaw-strike"] as readonly string[]).includes(
          observation.fields.modularPartRole,
        )
          ? observation.kind !== "weapon"
          : observation.kind !== "component"))
    ) {
      throw new Error("Entity modular part role is invalid");
    }
    if (observation.type === "entity") {
      const { equipmentMaxRank, modMaxRank, modBaseDrain, modPolarity } =
        observation.fields;
      if (
        equipmentMaxRank !== undefined &&
        (!(EQUIPMENT_KINDS as readonly string[]).includes(observation.kind) ||
          !Number.isSafeInteger(equipmentMaxRank) ||
          equipmentMaxRank < 30 ||
          equipmentMaxRank > 40)
      )
        throw new Error(
          "Equipment maximum rank requires equipment and must be between 30 and 40",
        );
      if (
        (modMaxRank !== undefined ||
          modBaseDrain !== undefined ||
          modPolarity !== undefined) &&
        observation.kind !== "mod"
      )
        throw new Error("Mod fields require a mod entity");
      if (
        modMaxRank !== undefined &&
        (!Number.isSafeInteger(modMaxRank) || modMaxRank < 0 || modMaxRank > 10)
      )
        throw new Error("Mod maximum rank must be between 0 and 10");
      if (
        modBaseDrain !== undefined &&
        (!Number.isSafeInteger(modBaseDrain) ||
          modBaseDrain < -4 ||
          modBaseDrain > 10)
      )
        throw new Error("Mod base drain must be between -4 and 10");
      if (
        modPolarity !== undefined &&
        !(MOD_POLARITIES as readonly string[]).includes(modPolarity)
      )
        throw new Error("Mod polarity is invalid");
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
        [
          "Railjack Intrinsic requirement",
          observation.railjackIntrinsicRequirement,
        ],
        ["Warframe rank requirement", observation.warframeRankRequirement],
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
      if (
        observation.railjackIntrinsicRequirement !== undefined &&
        observation.railjackIntrinsicRequirement > 10
      )
        throw new Error(
          "Node detail Railjack Intrinsic requirement cannot exceed 10",
        );
      if (
        observation.warframeRankRequirement !== undefined &&
        observation.warframeRankRequirement > 30
      )
        throw new Error(
          "Node detail Warframe rank requirement cannot exceed 30",
        );
      if (
        observation.activeAdversaryRequirement !== undefined &&
        !ADVERSARY_KINDS.includes(observation.activeAdversaryRequirement)
      )
        throw new Error("Node detail active adversary requirement is invalid");
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
  const cyclicSchedules = new Map<
    string,
    Extract<Observation, { type: "cyclic-reward-schedule" }>
  >();

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
    if (observation.type === "cyclic-reward-schedule") {
      if (cyclicSchedules.has(observation.key))
        throw new Error(
          `Candidate cyclic reward schedule ${observation.key} is declared more than once`,
        );
      if (
        !observation.key ||
        !observation.label ||
        !Number.isFinite(Date.parse(observation.epoch)) ||
        !Number.isSafeInteger(observation.intervalSeconds) ||
        observation.intervalSeconds < 1 ||
        !Number.isSafeInteger(observation.phaseCount) ||
        observation.phaseCount < 1 ||
        !Number.isSafeInteger(observation.choicesPerPhase) ||
        observation.choicesPerPhase < 1 ||
        !Number.isSafeInteger(observation.selectionsAllowed) ||
        observation.selectionsAllowed < 1 ||
        observation.selectionsAllowed > observation.choicesPerPhase
      )
        throw new Error(
          `Candidate cyclic reward schedule ${observation.key} is invalid`,
        );
      cyclicSchedules.set(observation.key, observation);
      continue;
    }
    let factKey: string | undefined;
    if (observation.type === "node-detail")
      factKey = `node-detail:${externalKey(observation.nodeExternalId)}`;
    if (observation.type === "node-item-requirement")
      factKey = `node-item-requirement:${externalKey(observation.nodeExternalId)}:${externalKey(observation.itemExternalId)}`;
    if (observation.type === "node-objective")
      factKey = `node-objective:${externalKey(observation.nodeExternalId)}:${observation.key}`;
    if (observation.type === "node-reward")
      factKey = `node-reward:${externalKey(observation.nodeExternalId)}:${observation.key}`;
    if (observation.type === "enhancement-option")
      factKey = `enhancement-option:${externalKey(observation.subjectExternalId)}:${observation.key}`;
    if (observation.type === "entity-attribute")
      factKey = `entity-attribute:${externalKey(observation.subjectExternalId)}:${observation.key}`;
    if (observation.type === "equipment-polarity-set")
      factKey = `equipment-polarity-set:${externalKey(observation.subjectExternalId)}`;
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
    if (observation.type === "cyclic-reward-choice") {
      const schedule = cyclicSchedules.get(observation.scheduleKey);
      if (
        !schedule ||
        !Number.isSafeInteger(observation.phaseIndex) ||
        observation.phaseIndex < 0 ||
        observation.phaseIndex >= schedule.phaseCount ||
        !Number.isSafeInteger(observation.position) ||
        observation.position < 0 ||
        observation.position >= schedule.choicesPerPhase ||
        !observation.phaseLabel ||
        !observation.primary.label
      )
        throw new Error(
          `Candidate cyclic reward choice ${observation.evidence.sourceRecordKey} is invalid`,
        );
      const factKey = `cyclic-reward-choice:${observation.scheduleKey}:${observation.phaseIndex}:${observation.position}`;
      if (uniqueFacts.has(factKey))
        throw new Error(
          `Candidate cyclic reward choice ${factKey} is declared more than once`,
        );
      uniqueFacts.set(factKey, observation);
      continue;
    }
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

function resolveCyclicRewardSubject(
  sqlite: Database.Database,
  state: ResolutionState,
  subject: {
    label: string;
    expectedKind?: EntityKind;
    externalIds?: ExternalIdentifier[];
  },
): { entityId?: EntityId; candidates: EntityId[] } {
  for (const externalId of subject.externalIds ?? []) {
    const entityId = state.externalIds.get(externalKey(externalId));
    const entity = entityId ? state.entities.get(entityId) : undefined;
    if (
      entityId &&
      entity &&
      !entity.retired &&
      (!subject.expectedKind || entity.kind === subject.expectedKind)
    )
      return { entityId, candidates: [entityId] };
    if (entityId) return { candidates: [entityId] };
  }
  const kindWhere = subject.expectedKind ? "and kind = ?" : "";
  const parameters = subject.expectedKind
    ? [subject.label, subject.expectedKind]
    : [subject.label];
  const exact = sqlite
    .prepare(
      `select id from entities
       where retired = 0 and name = ? collate nocase ${kindWhere}`,
    )
    .all(...parameters) as Array<{ id: EntityId }>;
  if (exact.length === 1)
    return { entityId: exact[0]!.id, candidates: [exact[0]!.id] };
  if (exact.length > 1) return { candidates: exact.map(({ id }) => id) };
  const aliasKindWhere = subject.expectedKind ? "and entity.kind = ?" : "";
  const aliasParameters = subject.expectedKind
    ? [normalizedAlias(subject.label), subject.expectedKind]
    : [normalizedAlias(subject.label)];
  const matches = sqlite
    .prepare(
      `select distinct entity.id from entities entity
       left join entity_aliases alias on alias.entity_id = entity.id
       where entity.retired = 0
         and alias.normalized = ? ${aliasKindWhere}`,
    )
    .all(...aliasParameters) as Array<{
    id: EntityId;
  }>;
  if (matches.length === 1)
    return { entityId: matches[0]!.id, candidates: [matches[0]!.id] };
  if (matches.length > 1) return { candidates: matches.map(({ id }) => id) };
  if (!subject.expectedKind) return { candidates: [] };
  const mismatched = sqlite
    .prepare(
      `select distinct entity.id from entities entity
       left join entity_aliases alias on alias.entity_id = entity.id
       where entity.retired = 0 and
         (entity.name = ? collate nocase or alias.normalized = ?)`,
    )
    .all(subject.label, normalizedAlias(subject.label)) as Array<{
    id: EntityId;
  }>;
  return { candidates: mismatched.map(({ id }) => id) };
}

function writeCyclicRewardConflict(
  sqlite: Database.Database,
  sourceRunId: string,
  recordKey: string,
  subject: {
    label: string;
    expectedKind?: EntityKind;
    externalIds?: ExternalIdentifier[];
  },
  candidates: EntityId[],
  counts: { conflictsCreated: number },
) {
  const expectation = subject.expectedKind
    ? ` expected as ${subject.expectedKind}`
    : "";
  writeConflict(
    sqlite,
    sourceRunId,
    recordKey,
    `Cyclic reward subject ${subject.label}${expectation} could not be resolved uniquely`,
    candidates,
    counts,
    subject.externalIds,
  );
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
  for (const field of [
    "name",
    "slug",
    "arcaneClass",
    "weaponClass",
    "modularPartRole",
    "equipmentMaxRank",
    "modMaxRank",
    "modBaseDrain",
    "modPolarity",
  ] as const) {
    if (
      first.fields[field] !== undefined &&
      second.fields[field] !== undefined &&
      first.fields[field] !== second.fields[field]
    )
      return true;
  }
  return Boolean(first.tombstone) !== Boolean(second.tombstone);
}
