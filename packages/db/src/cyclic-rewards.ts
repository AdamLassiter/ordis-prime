import type Database from "better-sqlite3";

export interface CyclicRewardEntity {
  id: string;
  kind: string;
  slug: string;
  name: string;
}

export interface CyclicRewardChoice {
  phaseIndex: number;
  phaseLabel: string;
  position: number;
  acquisitionMode: "item" | "path";
  primary: { label: string; entity?: CyclicRewardEntity };
  includedRewards: Array<{
    label: string;
    tier?: number;
    entity?: CyclicRewardEntity;
  }>;
}

export interface CyclicRewardSchedule {
  key: string;
  label: string;
  epoch: number;
  intervalSeconds: number;
  phaseCount: number;
  choicesPerPhase: number;
  selectionsAllowed: number;
  instructions: string;
  currentPhaseIndex: number;
  currentStartsAt: number;
  currentEndsAt: number;
  nextPhaseIndex: number;
  choices: CyclicRewardChoice[];
  source: { name: string; citationUrl?: string };
  sourceId: string;
  snapshotVersion: string;
  observedAt: number;
}

interface ScheduleRow {
  id: string;
  key: string;
  label: string;
  epoch: number;
  intervalSeconds: number;
  phaseCount: number;
  choicesPerPhase: number;
  selectionsAllowed: number;
  instructions: string;
  sourceName: string;
  sourceId: string;
  snapshotVersion: string;
  observedAt: number;
  citationUrl: string | null;
}

interface ChoiceRow {
  scheduleId: string;
  phaseIndex: number;
  phaseLabel: string;
  position: number;
  primaryLabel: string;
  acquisitionMode: "item" | "path";
  includedRewardsJson: string;
  entityId: string | null;
  entityKind: string | null;
  entitySlug: string | null;
  entityName: string | null;
}

export function listCyclicRewardSchedules(
  sqlite: Database.Database,
  now = Date.now(),
): CyclicRewardSchedule[] {
  const schedules = sqlite
    .prepare(
      `select schedule.id, schedule.key, schedule.label, schedule.epoch,
              schedule.interval_seconds as intervalSeconds,
              schedule.phase_count as phaseCount,
              schedule.choices_per_phase as choicesPerPhase,
              schedule.selections_allowed as selectionsAllowed,
              schedule.instructions, source.id as sourceId,
              source.name as sourceName, run.version as snapshotVersion,
              run.retrieved_at as observedAt,
              schedule.citation_url as citationUrl
       from cyclic_reward_schedules schedule
       join source_runs run on run.id = schedule.source_run_id and run.status = 'active'
       join sources source on source.id = run.source_id
       order by schedule.label collate nocase`,
    )
    .all() as ScheduleRow[];
  const choices = sqlite
    .prepare(
      `select choice.schedule_id as scheduleId, choice.phase_index as phaseIndex,
              choice.phase_label as phaseLabel, choice.position,
              choice.primary_label as primaryLabel,
              choice.acquisition_mode as acquisitionMode,
              choice.included_rewards_json as includedRewardsJson,
              entity.id as entityId, entity.kind as entityKind,
              entity.slug as entitySlug, entity.name as entityName
       from cyclic_reward_choices choice
       join cyclic_reward_schedules schedule on schedule.id = choice.schedule_id
       join source_runs run on run.id = schedule.source_run_id and run.status = 'active'
       left join entities entity on entity.id = choice.primary_entity_id and entity.retired = 0
       order by choice.phase_index, choice.position`,
    )
    .all() as ChoiceRow[];
  const entities = entityLookup(sqlite);
  return schedules.map((schedule) => {
    const intervalMilliseconds = schedule.intervalSeconds * 1_000;
    const occurrence = Math.floor(
      (now - schedule.epoch) / intervalMilliseconds,
    );
    const currentStartsAt = schedule.epoch + occurrence * intervalMilliseconds;
    const currentPhaseIndex = positiveModulo(occurrence, schedule.phaseCount);
    return {
      ...schedule,
      currentPhaseIndex,
      currentStartsAt,
      currentEndsAt: currentStartsAt + intervalMilliseconds,
      nextPhaseIndex: (currentPhaseIndex + 1) % schedule.phaseCount,
      choices: choices
        .filter((choice) => choice.scheduleId === schedule.id)
        .map((choice) => hydrateChoice(choice, entities)),
      source: {
        name: schedule.sourceName,
        citationUrl: schedule.citationUrl ?? undefined,
      },
    };
  });
}

export function listEntityCyclicRewards(
  sqlite: Database.Database,
  entityId: string,
  now = Date.now(),
): Array<{
  scheduleKey: string;
  scheduleLabel: string;
  phaseIndex: number;
  phaseLabel: string;
  current: boolean;
  next: boolean;
  startsAt?: number;
  acquisitionMode: "item" | "path";
}> {
  return listCyclicRewardSchedules(sqlite, now).flatMap((schedule) =>
    schedule.choices.flatMap((choice) => {
      const matches =
        choice.primary.entity?.id === entityId ||
        choice.includedRewards.some((reward) => reward.entity?.id === entityId);
      if (!matches) return [];
      const current = choice.phaseIndex === schedule.currentPhaseIndex;
      const next = choice.phaseIndex === schedule.nextPhaseIndex;
      return [
        {
          scheduleKey: schedule.key,
          scheduleLabel: schedule.label,
          phaseIndex: choice.phaseIndex,
          phaseLabel: choice.phaseLabel,
          current,
          next,
          startsAt: current
            ? schedule.currentStartsAt
            : next
              ? schedule.currentEndsAt
              : undefined,
          acquisitionMode: choice.acquisitionMode,
        },
      ];
    }),
  );
}

function hydrateChoice(
  row: ChoiceRow,
  entities: Map<string, CyclicRewardEntity>,
): CyclicRewardChoice {
  const primaryEntity =
    row.entityId && row.entityKind && row.entitySlug && row.entityName
      ? {
          id: row.entityId,
          kind: row.entityKind,
          slug: row.entitySlug,
          name: row.entityName,
        }
      : undefined;
  const included = parseIncludedRewards(row.includedRewardsJson);
  return {
    phaseIndex: row.phaseIndex,
    phaseLabel: row.phaseLabel,
    position: row.position,
    acquisitionMode: row.acquisitionMode,
    primary: { label: row.primaryLabel, entity: primaryEntity },
    includedRewards: included.map((reward) => ({
      label: reward.label,
      tier: reward.tier,
      entity: reward.entityId ? entities.get(reward.entityId) : undefined,
    })),
  };
}

function parseIncludedRewards(value: string): Array<{
  label: string;
  tier?: number;
  entityId?: string;
}> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as Record<string, unknown>;
      if (typeof value.label !== "string") return [];
      return [
        {
          label: value.label,
          tier: typeof value.tier === "number" ? value.tier : undefined,
          entityId:
            typeof value.entityId === "string" ? value.entityId : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

function entityLookup(
  sqlite: Database.Database,
): Map<string, CyclicRewardEntity> {
  const rows = sqlite
    .prepare("select id, kind, slug, name from entities where retired = 0")
    .all() as CyclicRewardEntity[];
  return new Map(rows.map((entity) => [entity.id, entity]));
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
