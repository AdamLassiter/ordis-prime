import type { EntityKind } from "./model.ts";

export const MASTERY_CAPABLE_KINDS = [
  "warframe",
  "weapon",
  "companion",
  "archwing",
  "vehicle",
] as const satisfies readonly EntityKind[];

export interface CollectionValues {
  kind: string;
  ownedCount: number;
  builtCount: number;
  wantedCount: number;
  mastered?: boolean;
  goalRequiredCount?: number;
}

export interface CollectionState {
  acquired: boolean;
  masteryCapable: boolean;
  explicitlyWanted: boolean;
  implicitlyWanted: boolean;
  requiredByGoal: boolean;
  wanted: boolean;
}

export function deriveCollectionState(
  values: CollectionValues,
): CollectionState {
  const masteryCapable = (MASTERY_CAPABLE_KINDS as readonly string[]).includes(
    values.kind,
  );
  const explicitlyWanted = values.wantedCount > 0;
  const implicitlyWanted = masteryCapable && values.mastered !== true;
  const requiredByGoal = (values.goalRequiredCount ?? 0) > 0;
  return {
    acquired: values.ownedCount > 0 || values.builtCount > 0,
    masteryCapable,
    explicitlyWanted,
    implicitlyWanted,
    requiredByGoal,
    wanted: explicitlyWanted || implicitlyWanted || requiredByGoal,
  };
}
