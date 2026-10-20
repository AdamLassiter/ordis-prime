export type EntityId = string & { readonly __entityId: unique symbol };

export const ADVERSARY_KINDS = [
  "kuva-lich",
  "sister-of-parvos",
  "technocyte-coda",
] as const;
export type AdversaryKind = (typeof ADVERSARY_KINDS)[number];
export const PLAYER_ACTIVE_ADVERSARIES = ["none", ...ADVERSARY_KINDS] as const;
export type PlayerActiveAdversary = (typeof PLAYER_ACTIVE_ADVERSARIES)[number];
export const ADVERSARY_LABELS: Record<AdversaryKind, string> = {
  "kuva-lich": "Kuva Lich",
  "sister-of-parvos": "Sister of Parvos",
  "technocyte-coda": "Technocyte Coda",
};

export function isPlayerActiveAdversary(
  value: unknown,
): value is PlayerActiveAdversary {
  return (
    typeof value === "string" &&
    (PLAYER_ACTIVE_ADVERSARIES as readonly string[]).includes(value)
  );
}

export type EntityKind =
  | "unknown"
  | "warframe"
  | "weapon"
  | "companion"
  | "mod"
  | "arcane"
  | "shard"
  | "resource"
  | "relic"
  | "blueprint"
  | "component"
  | "node"
  | "planet"
  | "quest"
  | "enemy"
  | "boss"
  | "mechanic"
  | "secret"
  | "ability"
  | "archwing";

export const EQUIPMENT_KINDS = [
  "warframe",
  "weapon",
  "companion",
  "archwing",
] as const satisfies readonly EntityKind[];

export const ARCANE_CLASSES = [
  "warframe",
  "operator",
  "amp",
  "primary",
  "secondary",
  "melee",
  "kitgun",
  "zaw",
  "bow",
  "shotgun",
] as const;
export type ArcaneClass = (typeof ARCANE_CLASSES)[number];

export const WEAPON_CLASSES = [
  "primary",
  "secondary",
  "melee",
  "bow",
  "shotgun",
  "kitgun",
  "zaw",
  "archgun",
  "archmelee",
  "companion",
  "amp",
] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];

export const MOD_POLARITIES = [
  "aura",
  "madurai",
  "naramon",
  "penjaga",
  "umbra",
  "unairu",
  "universal",
  "vazarin",
  "zenurik",
] as const;
export type ModPolarity = (typeof MOD_POLARITIES)[number];

export const EQUIPMENT_POLARITY_ROLES = [
  "normal",
  "aura",
  "stance",
  "exilus",
] as const;
export type EquipmentPolarityRole = (typeof EQUIPMENT_POLARITY_ROLES)[number];

export interface CanonicalEntity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  slug: string;
  description?: string;
  arcaneClass?: ArcaneClass;
  weaponClass?: WeaponClass;
  equipmentMaxRank?: number;
  modMaxRank?: number;
  modBaseDrain?: number;
  modPolarity?: ModPolarity;
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
  fields: Partial<
    Pick<
      CanonicalEntity,
      | "name"
      | "slug"
      | "description"
      | "arcaneClass"
      | "weaponClass"
      | "equipmentMaxRank"
      | "modMaxRank"
      | "modBaseDrain"
      | "modPolarity"
    >
  >;
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
  railjackIntrinsicRequirement?: number;
  warframeRankRequirement?: number;
  activeAdversaryRequirement?: AdversaryKind;
  nodeType?: number;
  evidence: Evidence;
}

export interface NodeItemRequirementObservation {
  type: "node-item-requirement";
  nodeExternalId: ExternalIdentifier;
  itemExternalId: ExternalIdentifier;
  quantity: number;
  evidence: Evidence;
}

export const RELATION_KINDS = [
  "requires",
  "unlocks",
  "occurs-at",
  "involves",
  "rewards",
  "connects-to",
  "follows",
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export interface EntityRelationObservation {
  type: "entity-relation";
  fromExternalId: ExternalIdentifier;
  toExternalId: ExternalIdentifier;
  kind: RelationKind;
  notes?: string;
  evidence: Evidence;
}

export interface EnhancementOptionObservation {
  type: "enhancement-option";
  subjectExternalId: ExternalIdentifier;
  key: string;
  label: string;
  evidence: Evidence;
}

export interface EquipmentPolarity {
  role: EquipmentPolarityRole;
  polarity: ModPolarity;
  quantity: number;
}

export interface EquipmentPolaritySetObservation {
  type: "equipment-polarity-set";
  subjectExternalId: ExternalIdentifier;
  configuration?: string;
  polarities: EquipmentPolarity[];
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

export type Observation =
  | EntityObservation
  | DropObservation
  | RecipeObservation
  | NodeDetailObservation
  | NodeItemRequirementObservation
  | EntityRelationObservation
  | EnhancementOptionObservation
  | EquipmentPolaritySetObservation
  | RankingSetObservation
  | RankingObservation;

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
