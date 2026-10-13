export type EntityId = string & { readonly __entityId: unique symbol };

export type EntityKind =
  | "unknown" | "warframe" | "weapon" | "companion" | "mod" | "resource"
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

export interface NodeDetailObservation {
  type: "node-detail";
  nodeExternalId: ExternalIdentifier;
  planet: string;
  missionType?: string;
  faction?: string;
  minimumEnemyLevel?: number;
  maximumEnemyLevel?: number;
  masteryRequirement?: number;
  nodeType?: number;
  evidence: Evidence;
}

export const RELATION_KINDS = ["requires", "unlocks", "occurs-at", "involves", "rewards", "connects-to"] as const;
export type RelationKind = typeof RELATION_KINDS[number];

export interface EntityRelationObservation {
  type: "entity-relation";
  fromExternalId: ExternalIdentifier;
  toExternalId: ExternalIdentifier;
  kind: RelationKind;
  notes?: string;
  evidence: Evidence;
}

export interface RankingSetObservation {
  type: "ranking-set";
  key: string;
  title: string;
  author: string;
  publishedAt: string;
  gameVersion?: string;
  scope: string;
  scale: string[];
  licenseNote: string;
  evidence: Evidence;
}

export interface RankingObservation {
  type: "ranking";
  setKey: string;
  subjectExternalId: ExternalIdentifier;
  tier: string;
  position?: number;
  timestampSeconds?: number;
  notes?: string;
  evidence: Evidence;
}

export type Observation = EntityObservation | DropObservation | RecipeObservation | NodeDetailObservation | EntityRelationObservation | RankingSetObservation | RankingObservation;

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
