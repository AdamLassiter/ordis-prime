export type EntityId = string & { readonly __entityId: unique symbol };

export type EntityKind =
  | "warframe" | "weapon" | "companion" | "mod" | "resource"
  | "relic" | "blueprint" | "component" | "node" | "planet"
  | "quest" | "enemy" | "boss" | "mechanic" | "secret";

export interface CanonicalEntity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  slug: string;
  description?: string;
  retired: boolean;
}

export interface Evidence {
  sourceId: string;
  sourceRecordKey: string;
  snapshotVersion: string;
  retrievedAt: string;
  citationUrl?: string;
  license?: string;
  path?: string;
}

export interface ExternalIdentifier {
  sourceId: string;
  namespace: string;
  value: string;
}

export interface EntityObservation {
  type: "entity";
  externalIds: ExternalIdentifier[];
  kind: EntityKind;
  fields: Partial<Pick<CanonicalEntity, "name" | "slug" | "description">>;
  aliases?: string[];
  tombstone?: boolean;
  evidence: Evidence;
}

export interface DropObservation {
  type: "drop";
  rewardExternalId: ExternalIdentifier;
  nodeExternalId?: ExternalIdentifier;
  locationLabel: string;
  chance?: number;
  rotation?: string;
  quantity?: number;
  evidence: Evidence;
}

export interface RecipeObservation {
  type: "recipe";
  outputExternalId: ExternalIdentifier;
  ingredients: Array<{ externalId: ExternalIdentifier; quantity: number }>;
  outputQuantity?: number;
  evidence: Evidence;
}

export type Observation = EntityObservation | DropObservation | RecipeObservation;

export interface InventoryEntry {
  entityId: EntityId;
  ownedCount: number;
  builtCount: number;
  wantedCount: number;
  mastered?: boolean;
  subsumed?: boolean;
}

export interface Recipe {
  outputId: EntityId;
  outputQuantity: number;
  ingredients: Array<{ entityId: EntityId; quantity: number }>;
}

export interface DropSource {
  rewardId: EntityId;
  nodeId?: EntityId;
  locationLabel: string;
  chance?: number;
  rotation?: string;
  quantity: number;
}
