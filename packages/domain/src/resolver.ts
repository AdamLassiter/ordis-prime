import type { CanonicalEntity, EntityId, EntityObservation, ExternalIdentifier } from "./model.ts";

export interface ResolutionState {
  entities: Map<EntityId, CanonicalEntity>;
  externalIds: Map<string, EntityId>;
  aliases: Map<string, EntityId[]>;
}

export type Resolution =
  | { status: "matched"; entityId: EntityId; by: "external-id" | "alias" }
  | { status: "new" }
  | { status: "conflict"; candidateIds: EntityId[] };

export function externalKey(id: ExternalIdentifier): string {
  return `${id.sourceId}\u0000${id.namespace}\u0000${id.value}`;
}

export function normalizedAlias(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
}

export function resolveEntity(observation: EntityObservation, state: ResolutionState): Resolution {
  const direct = new Set(
    observation.externalIds.map((id) => state.externalIds.get(externalKey(id))).filter(Boolean),
  );
  if (direct.size === 1) return { status: "matched", entityId: [...direct][0]!, by: "external-id" };
  if (direct.size > 1) return { status: "conflict", candidateIds: [...direct] as EntityId[] };

  const names = [observation.fields.name, ...(observation.aliases ?? [])].filter(
    (value): value is string => Boolean(value),
  );
  const aliases = new Set(names.flatMap((name) => state.aliases.get(normalizedAlias(name)) ?? []).filter((entityId) => {
    const candidate = state.entities.get(entityId);
    if (!candidate) return false;
    if (observation.kind === "unknown") return candidate.kind === "unknown";
    return candidate.kind === "unknown" || candidate.kind === observation.kind;
  }));
  if (aliases.size === 1) return { status: "matched", entityId: [...aliases][0]!, by: "alias" };
  if (aliases.size > 1) return { status: "conflict", candidateIds: [...aliases] };
  return { status: "new" };
}
