import {
  MOD_POLARITIES,
  type ModularPartRole,
  normalizedAlias,
  type ArcaneClass,
  type EntityKind,
  type EntityObservation,
  type EquipmentPolarity,
  type ModPolarity,
  type Observation,
  type WeaponClass,
} from "@ordis-prime/domain";
import {
  createSnapshot,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";

export interface WfcdItemIdentity {
  uniqueName?: string;
  name?: string;
  category?: string;
  type?: string;
  productCategory?: string;
  description?: string;
  components?: WfcdItemIdentity[];
}
interface WfcdItem extends WfcdItemIdentity {
  wikiaUrl?: string;
  components?: WfcdComponent[];
  systemName?: string;
  minEnemyLevel?: number;
  maxEnemyLevel?: number;
  masteryReq?: number;
  nodeType?: number;
  fusionLimit?: number;
  baseDrain?: number;
  polarity?: string;
  polarities?: unknown;
  drops?: WfcdDrop[];
  rewards?: WfcdRelicReward[];
  vaulted?: boolean;
  tradable?: boolean;
}
interface WfcdComponent extends WfcdItemIdentity {
  itemCount?: number;
  drops?: WfcdDrop[];
}
interface WfcdDrop {
  location?: string;
  chance?: number;
  rotation?: string;
}
interface WfcdRelicReward {
  chance?: number;
  rarity?: string;
  item?: {
    name?: string;
    uniqueName?: string;
    warframeMarket?: { id?: string; urlName?: string };
  };
}
const categories: Record<string, EntityKind> = {
  Warframes: "warframe",
  Primary: "weapon",
  Secondary: "weapon",
  Melee: "weapon",
  "Arch-Gun": "weapon",
  "Arch-Melee": "weapon",
  SentinelWeapons: "weapon",
  Archwing: "archwing",
  Mods: "mod",
  Arcanes: "arcane",
  Resources: "resource",
  Fish: "resource",
  Relics: "relic",
  Node: "node",
  Quests: "quest",
  Pets: "companion",
  Sentinels: "companion",
  Components: "component",
  Enemy: "enemy",
  Gear: "gear",
  Glyphs: "cosmetic",
  Honoria: "cosmetic",
  Railjack: "weapon",
  Sigils: "cosmetic",
  Skins: "cosmetic",
};
export const DEFAULT_WFCD_ITEMS_URL = "https://api.warframestat.us/items";
const PARSER_VERSION = "wfcd-items-v18";
const ARCHON_SHARD_PREFIX = "/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal";
const resourceTypes = new Set([
  "Resource",
  "Equipment Adapter",
  "Pet Resource",
  "Alloy",
  "Currency",
  "Fish Part",
  "Conservation Tag",
  "Cut Gem",
  "Eidolon Shard",
  "Medallion",
  "Focus Lens",
  "Ayatan Star",
  "Ayatan Sculpture",
]);
const arcaneClasses: Record<string, ArcaneClass> = {
  Arcane: "warframe",
  "Warframe Arcane": "warframe",
  "Operator Arcane": "operator",
  "Amp Arcane": "amp",
  "Primary Arcane": "primary",
  "Secondary Arcane": "secondary",
  "Melee Arcane": "melee",
  "Kitgun Arcane": "kitgun",
  "Zaw Arcane": "zaw",
  "Bow Arcane": "bow",
  "Shotgun Arcane": "shotgun",
};

export class WfcdItemsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "wfcd-items",
    name: "WFCD warframe-items",
    homepage: "https://github.com/WFCD/warframe-items",
    license: "MIT",
    priority: 100,
  };
  private readonly url: string;
  constructor(url = DEFAULT_WFCD_ITEMS_URL) {
    this.url = url;
  }
  async fetch(context: { signal?: AbortSignal }): Promise<Snapshot> {
    const response = await fetch(this.url, {
      signal: context.signal,
      headers: {
        "User-Agent":
          "OrdisPrime/0.1 (+https://github.com/adamlassiter/ordis-prime)",
      },
    });
    if (!response.ok)
      throw new Error(`WFCD items fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const upstreamVersion =
      response.headers.get("etag") ?? new Date().toISOString();
    return createSnapshot({
      sourceId: this.source.id,
      version: `${upstreamVersion}|${PARSER_VERSION}`,
      retrievedAt: new Date().toISOString(),
      mediaType: "application/json",
      bytes,
    });
  }
  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const items = JSON.parse(
      new TextDecoder().decode(snapshot.bytes),
    ) as WfcdItem[];
    if (!Array.isArray(items))
      throw new Error("WFCD items payload must be an array");
    const declaredItems = new Map(
      items
        .filter((item) => item.uniqueName)
        .map((item) => [item.uniqueName!, item]),
    );
    const canonicalNames = canonicalNamesForItems([...declaredItems.values()]);
    const componentOccurrences = new Map<string, number>();
    const rewardIdentities = new Map<string, Set<string>>();
    for (const item of items)
      for (const component of item.components ?? []) {
        if (component.uniqueName)
          componentOccurrences.set(
            component.uniqueName,
            (componentOccurrences.get(component.uniqueName) ?? 0) + 1,
          );
      }
    for (const item of items)
      for (const reward of item.rewards ?? []) {
        const rewardItem = reward.item;
        if (!rewardItem?.uniqueName || !rewardItem.name) continue;
        const identities =
          rewardIdentities.get(rewardItem.uniqueName) ?? new Set();
        identities.add(
          rewardItem.warframeMarket?.id ??
            rewardItem.warframeMarket?.urlName ??
            rewardItem.name,
        );
        rewardIdentities.set(rewardItem.uniqueName, identities);
      }
    const ambiguousRewardUniqueNames = new Set(
      [...rewardIdentities]
        .filter(([, identities]) => identities.size > 1)
        .map(([uniqueName]) => uniqueName),
    );
    const canonicalRelicBaseIds = new Map<string, string>();
    for (const item of items) {
      if (!item.uniqueName || !item.name || !relicRefinement(item.name))
        continue;
      const key = normalizedAlias(
        item.name.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, ""),
      );
      const baseId = item.uniqueName.replace(
        /(Bronze|Silver|Gold|Platinum)$/,
        "",
      );
      const current = canonicalRelicBaseIds.get(key);
      if (!current || baseId.localeCompare(current) < 0)
        canonicalRelicBaseIds.set(key, baseId);
    }
    const declaredKinds = new Map<string, EntityKind>();
    const declaredFields = new Map<string, EntityObservation["fields"]>();
    for (const item of items)
      if (item.uniqueName && item.name) {
        const kind = kindFor(item);
        const name =
          kind === "relic" && relicRefinement(item.name)
            ? item.name.replace(
                / (Intact|Exceptional|Flawless|Radiant)$/,
                " Relic",
              )
            : (canonicalNames.get(item.uniqueName) ?? cleanName(item.name));
        declaredKinds.set(item.uniqueName, kind);
        declaredFields.set(item.uniqueName, {
          name,
          slug: slugify(name),
          description: item.description,
        });
      }
    for (const item of items)
      for (const component of item.components ?? []) {
        if (
          !component.uniqueName ||
          !component.name ||
          declaredKinds.has(component.uniqueName)
        )
          continue;
        const shared =
          (componentOccurrences.get(component.uniqueName) ?? 0) > 1;
        const kind =
          shared && component.category === "Misc"
            ? "resource"
            : kindFor(component, "component");
        const name =
          kind === "component"
            ? shared
              ? sharedComponentName(component)
              : `${item.name} ${component.name}`
            : component.name;
        declaredKinds.set(component.uniqueName, kind);
        declaredFields.set(component.uniqueName, {
          name,
          slug: slugify(name),
          description: component.description,
        });
      }
    const emittedVaultedRelics = new Set<string>();
    const emittedRelicSchedules = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (!item.uniqueName || !item.name) continue;
      const kind = kindFor(item);
      const evidence = {
        sourceId: this.source.id,
        sourceRecordKey: item.uniqueName,
        snapshotVersion: snapshot.version,
        retrievedAt: snapshot.retrievedAt,
        citationUrl: item.wikiaUrl,
        license: this.source.license,
        path: `[${index}]`,
      };
      const name =
        kind === "relic" && relicRefinement(item.name)
          ? item.name.replace(
              / (Intact|Exceptional|Flawless|Radiant)$/,
              " Relic",
            )
          : (canonicalNames.get(item.uniqueName) ?? cleanName(item.name));
      const relicBaseUniqueName =
        kind === "relic" && relicRefinement(item.name)
          ? item.uniqueName.replace(/(Bronze|Silver|Gold|Platinum)$/, "")
          : undefined;
      const canonicalRelicBaseUniqueName = relicBaseUniqueName
        ? canonicalRelicBaseIds.get(
            normalizedAlias(
              item.name.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, ""),
            ),
          )
        : undefined;
      yield {
        type: "entity",
        kind,
        externalIds: [
          {
            sourceId: this.source.id,
            namespace: "uniqueName",
            value: item.uniqueName,
          },
          ...(canonicalRelicBaseUniqueName
            ? [
                {
                  sourceId: this.source.id,
                  namespace: "uniqueName",
                  value: canonicalRelicBaseUniqueName,
                },
              ]
            : []),
          ...(relicBaseUniqueName &&
          relicBaseUniqueName !== canonicalRelicBaseUniqueName
            ? [
                {
                  sourceId: this.source.id,
                  namespace: "uniqueName",
                  value: relicBaseUniqueName,
                },
              ]
            : []),
        ],
        fields: {
          name,
          slug: slugify(name),
          description: item.description,
          arcaneClass:
            kind === "arcane" ? arcaneClasses[item.type ?? ""] : undefined,
          weaponClass: kind === "weapon" ? weaponClassFor(item) : undefined,
          modularPartRole: modularPartRoleFor(item),
          modMaxRank:
            kind === "mod" &&
            Number.isSafeInteger(item.fusionLimit) &&
            item.fusionLimit! >= 0 &&
            item.fusionLimit! <= 10
              ? item.fusionLimit
              : undefined,
          modBaseDrain:
            kind === "mod" &&
            Number.isSafeInteger(item.baseDrain) &&
            item.baseDrain! >= -4 &&
            item.baseDrain! <= 10
              ? item.baseDrain
              : undefined,
          modPolarity:
            kind === "mod" && isModPolarity(item.polarity)
              ? item.polarity
              : undefined,
        },
        evidence,
      };
      yield* dropObservations(item, item.uniqueName, evidence, `[${index}]`);
      if (kind === "relic") {
        if (
          typeof item.vaulted === "boolean" &&
          canonicalRelicBaseUniqueName &&
          !emittedVaultedRelics.has(normalizedAlias(name))
        ) {
          emittedVaultedRelics.add(normalizedAlias(name));
          yield {
            type: "entity-attribute",
            subjectExternalId: {
              sourceId: this.source.id,
              namespace: "uniqueName",
              value: canonicalRelicBaseUniqueName,
            },
            key: "vaulted",
            label: "Vaulted",
            value: String(item.vaulted),
            evidence: {
              ...evidence,
              sourceRecordKey: `${item.uniqueName}:vaulted`,
            },
          };
        }
        yield* relicRewardObservations(
          item,
          evidence,
          `[${index}]`,
          ambiguousRewardUniqueNames,
          declaredKinds,
          declaredFields,
          emittedRelicSchedules,
          canonicalRelicBaseUniqueName,
        );
      }
      const companionPolarities =
        kind === "companion"
          ? parseCompanionPolarities(item.polarities, name)
          : undefined;
      if (companionPolarities)
        yield {
          type: "equipment-polarity-set",
          subjectExternalId: {
            sourceId: this.source.id,
            namespace: "uniqueName",
            value: item.uniqueName,
          },
          polarities: companionPolarities,
          evidence: {
            ...evidence,
            sourceRecordKey: `${item.uniqueName}:factory-polarities`,
          },
        };
      if (kind === "node" && item.systemName)
        yield {
          type: "node-detail",
          nodeExternalId: {
            sourceId: this.source.id,
            namespace: "uniqueName",
            value: item.uniqueName,
          },
          planet: item.systemName,
          minimumEnemyLevel: item.minEnemyLevel,
          maximumEnemyLevel: item.maxEnemyLevel,
          masteryRequirement: item.masteryReq,
          nodeType: item.nodeType,
          evidence: { ...evidence, path: `[${index}]` },
        };
      const components = (item.components ?? []).filter(
        (component) => component.uniqueName && component.name,
      );
      for (const [componentIndex, component] of components.entries()) {
        const declared = declaredItems.get(component.uniqueName!);
        const shared =
          (componentOccurrences.get(component.uniqueName!) ?? 0) > 1;
        const componentKind = declared
          ? kindFor(declared)
          : shared && component.category === "Misc"
            ? "resource"
            : kindFor(component, "component");
        const componentName = declared?.name
          ? (canonicalNames.get(component.uniqueName!) ??
            cleanName(declared.name))
          : componentKind === "component"
            ? shared
              ? sharedComponentName(component)
              : `${item.name} ${component.name}`
            : component.name!;
        yield {
          type: "entity",
          kind: componentKind,
          externalIds: [
            {
              sourceId: this.source.id,
              namespace: "uniqueName",
              value: component.uniqueName!,
            },
          ],
          fields: {
            name: componentName,
            slug: slugify(componentName),
            description: declared?.description ?? component.description,
          },
          evidence: {
            ...evidence,
            sourceRecordKey: component.uniqueName!,
            path: `[${index}].components[${componentIndex}]`,
          },
        };
        yield* dropObservations(
          component,
          component.uniqueName!,
          evidence,
          `[${index}].components[${componentIndex}]`,
        );
      }
      if (components.length)
        yield {
          type: "recipe",
          outputExternalId: {
            sourceId: this.source.id,
            namespace: "uniqueName",
            value: item.uniqueName,
          },
          ingredients: components.map((component) => ({
            externalId: {
              sourceId: this.source.id,
              namespace: "uniqueName",
              value: component.uniqueName!,
            },
            quantity: component.itemCount ?? 1,
          })),
          evidence,
        };
    }
  }
}

function* relicRewardObservations(
  item: WfcdItem,
  evidence: EntityObservation["evidence"],
  path: string,
  ambiguousRewardUniqueNames: ReadonlySet<string>,
  declaredKinds: ReadonlyMap<string, EntityKind>,
  declaredFields: ReadonlyMap<string, EntityObservation["fields"]>,
  emittedRelicSchedules: Set<string>,
  canonicalRelicBaseUniqueName?: string,
): Generator<Observation> {
  if (!item.uniqueName || !item.name || !item.rewards?.length) return;
  const refinement = relicRefinement(item.name);
  if (!refinement) return;
  const scheduleKey = `${normalizedAlias(item.name.replace(/ (Intact|Exceptional|Flawless|Radiant)$/, ""))}:${refinement}`;
  if (emittedRelicSchedules.has(scheduleKey)) return;
  emittedRelicSchedules.add(scheduleKey);
  if (item.rewards.length !== 6)
    throw new Error(
      `WFCD relic ${item.name} has ${item.rewards.length} rewards`,
    );
  const total = item.rewards.reduce(
    (sum, reward) =>
      sum + (typeof reward.chance === "number" ? reward.chance : 0),
    0,
  );
  if (Math.abs(total - 100) > 0.1)
    throw new Error(`WFCD relic ${item.name} reward chances total ${total}`);
  const baseUniqueName =
    canonicalRelicBaseUniqueName ??
    item.uniqueName.replace(/(Bronze|Silver|Gold|Platinum)$/, "");
  for (const [rewardIndex, reward] of item.rewards.entries()) {
    const rewardItem = reward.item;
    if (
      !rewardItem?.name ||
      !rewardItem.uniqueName ||
      typeof reward.chance !== "number"
    )
      throw new Error(
        `WFCD relic ${item.name} reward ${rewardIndex} is incomplete`,
      );
    const rarity = relicRarity(reward.rarity);
    if (!rarity)
      throw new Error(
        `WFCD relic ${item.name} reward ${rewardIndex} has invalid rarity`,
      );
    const externalIds = [
      ...(!ambiguousRewardUniqueNames.has(rewardItem.uniqueName)
        ? [
            {
              sourceId: "wfcd-items",
              namespace: "uniqueName",
              value: rewardItem.uniqueName,
            },
          ]
        : []),
      ...(ambiguousRewardUniqueNames.has(rewardItem.uniqueName) &&
      !rewardItem.warframeMarket?.id
        ? [
            {
              sourceId: "wfcd-items",
              namespace: "relicReward",
              value: `${rewardItem.uniqueName}:${normalizedAlias(rewardItem.name)}`,
            },
          ]
        : []),
    ];
    if (!externalIds.length)
      throw new Error(
        `WFCD relic reward ${rewardItem.name} has no unambiguous identity`,
      );
    const declaredKind = !ambiguousRewardUniqueNames.has(rewardItem.uniqueName)
      ? declaredKinds.get(rewardItem.uniqueName)
      : undefined;
    const declaredEntityFields = declaredKind
      ? declaredFields.get(rewardItem.uniqueName)
      : undefined;
    yield {
      type: "entity",
      // WFCD exposes Prime blueprints through the parent item's component list,
      // where this project already models them as components. Keep the reward
      // declaration compatible with that canonical identity; the name still
      // preserves that the rewarded object is a blueprint.
      kind: declaredKind ?? "component",
      externalIds,
      fields: declaredEntityFields ?? {
        name: rewardItem.name,
        slug: slugify(rewardItem.name),
      },
      evidence: {
        ...evidence,
        sourceRecordKey: rewardItem.uniqueName,
        path: `${path}.rewards[${rewardIndex}].item`,
      },
    };
    yield {
      type: "relic-reward",
      relicExternalId: {
        sourceId: "wfcd-items",
        namespace: "uniqueName",
        value: baseUniqueName,
      },
      rewardExternalId: externalIds[0]!,
      refinement,
      rarity,
      chance: reward.chance / 100,
      evidence: {
        ...evidence,
        sourceRecordKey: `${item.uniqueName}:reward:${rewardIndex}:${rewardItem.uniqueName}`,
        path: `${path}.rewards[${rewardIndex}]`,
      },
    };
  }
}

function relicRefinement(name: string) {
  if (/ Intact$/.test(name)) return "intact" as const;
  if (/ Exceptional$/.test(name)) return "exceptional" as const;
  if (/ Flawless$/.test(name)) return "flawless" as const;
  if (/ Radiant$/.test(name)) return "radiant" as const;
}

function relicRarity(value: string | undefined) {
  const normalized = value?.toLocaleLowerCase("en");
  return normalized === "common" ||
    normalized === "uncommon" ||
    normalized === "rare"
    ? normalized
    : undefined;
}

function parseCompanionPolarities(
  value: unknown,
  name: string,
): EquipmentPolarity[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new Error(`WFCD companion ${name} has invalid polarities`);
  const counts = new Map<ModPolarity, number>();
  for (const polarity of value) {
    if (!isModPolarity(polarity))
      throw new Error(`WFCD companion ${name} has invalid polarity`);
    counts.set(polarity, (counts.get(polarity) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([polarity, quantity]) => ({
      role: "normal",
      polarity,
      quantity,
    }));
}

function isModPolarity(value: unknown): value is ModPolarity {
  return (
    typeof value === "string" &&
    (MOD_POLARITIES as readonly string[]).includes(value)
  );
}
function kindFor(
  item: Pick<WfcdItem, "uniqueName" | "category" | "type">,
  fallback: EntityKind = "unknown",
): EntityKind {
  if (item.uniqueName?.startsWith(ARCHON_SHARD_PREFIX)) return "shard";
  if (item.type && resourceTypes.has(item.type)) return "resource";
  if (item.type?.endsWith(" Riven Mod")) return "mod";
  if (
    [
      "Amp",
      "Exalted Weapon",
      "Pistol",
      "Rifle",
      "Shotgun",
      "Railjack Turret",
    ].includes(item.type ?? "")
  )
    return "weapon";
  if (item.type === "Nightwave Challenge") return "challenge";
  if (item.type === "Captura" || item.type === "Ship Decoration")
    return "decoration";
  if (
    item.category === "Skins" ||
    item.category === "Glyphs" ||
    item.category === "Sigils" ||
    item.category === "Honoria"
  )
    return "cosmetic";
  if (
    [
      "Boosters",
      "Conservation Prey",
      "Extractor",
      "Fish Bait",
      "Gear",
      "Key",
      "Orbiter",
      "Ship Segment",
      "Simulacrum",
      "Specter",
    ].includes(item.type ?? "") ||
    item.category === "Gear"
  )
    return "gear";
  if (item.type === "K-Drive Component" || item.type === "Pet Collar")
    return "component";
  if (item.type === "Kitgun Component")
    return item.uniqueName?.includes("/Barrel/") ? "weapon" : "component";
  if (item.type === "Zaw Component")
    return /\/Tips?\//.test(item.uniqueName ?? "") ? "weapon" : "component";
  const categoryKind =
    categories[item.category ?? ""] ??
    (item.type === "Blueprint" ? "blueprint" : undefined);
  if (categoryKind) return categoryKind;
  if (item.category === "Misc" || item.type === "Misc") return "misc";
  return fallback;
}

export function classifyWfcdItem(
  item: WfcdItemIdentity,
  fallback: EntityKind = "unknown",
): EntityKind {
  return kindFor(item, fallback);
}

export interface CanonicalWfcdItemIdentity extends WfcdItemIdentity {
  uniqueName: string;
  name: string;
  kind: EntityKind;
}

/**
 * Produces the same identities exposed by this adapter, including canonical
 * names for embedded components which do not appear as top-level API items.
 */
export function canonicalWfcdItemIdentities(
  items: WfcdItemIdentity[],
): CanonicalWfcdItemIdentity[] {
  const typedItems = items as WfcdItem[];
  const declaredItems = new Map(
    typedItems
      .filter((item) => item.uniqueName)
      .map((item) => [item.uniqueName!, item]),
  );
  const canonicalNames = canonicalNamesForItems([...declaredItems.values()]);
  const componentOccurrences = new Map<string, number>();
  for (const item of typedItems)
    for (const component of item.components ?? [])
      if (component.uniqueName)
        componentOccurrences.set(
          component.uniqueName,
          (componentOccurrences.get(component.uniqueName) ?? 0) + 1,
        );

  const result: CanonicalWfcdItemIdentity[] = [];
  const seen = new Set<string>();
  const add = (
    item: WfcdItemIdentity,
    name: string,
    kind: EntityKind,
  ): void => {
    if (!item.uniqueName || seen.has(`${item.uniqueName}\0${name}`)) return;
    seen.add(`${item.uniqueName}\0${name}`);
    result.push({ ...item, uniqueName: item.uniqueName, name, kind });
  };

  for (const item of typedItems) {
    if (!item.uniqueName || !item.name) continue;
    add(
      item,
      canonicalNames.get(item.uniqueName) ?? cleanName(item.name),
      kindFor(item),
    );
    for (const component of item.components ?? []) {
      if (!component.uniqueName || !component.name) continue;
      const declared = declaredItems.get(component.uniqueName);
      const shared = (componentOccurrences.get(component.uniqueName) ?? 0) > 1;
      const componentKind = declared
        ? kindFor(declared)
        : shared && component.category === "Misc"
          ? "resource"
          : kindFor(component, "component");
      const componentName = declared?.name
        ? (canonicalNames.get(component.uniqueName) ?? cleanName(declared.name))
        : componentKind === "component"
          ? shared
            ? sharedComponentName(component)
            : `${item.name} ${component.name}`
          : cleanName(component.name);
      add(declared ?? component, componentName, componentKind);
    }
  }
  return result;
}

function* dropObservations(
  item: Pick<WfcdItem, "drops">,
  rewardId: string,
  evidence: EntityObservation["evidence"],
  path: string,
): Generator<Observation> {
  for (const [index, drop] of (item.drops ?? []).entries()) {
    if (!drop.location) continue;
    const nodeExternalId = dropNodeExternalId(drop.location);
    yield {
      type: "drop",
      rewardExternalId: {
        sourceId: "wfcd-items",
        namespace: "uniqueName",
        value: rewardId,
      },
      nodeExternalId,
      locationLabel: drop.location,
      chance: typeof drop.chance === "number" ? drop.chance / 100 : undefined,
      rotation: drop.rotation,
      evidence: {
        ...evidence,
        sourceRecordKey: `${rewardId}:drop:${index}`,
        path: `${path}.drops[${index}]`,
      },
    };
  }
}

function dropNodeExternalId(location: string) {
  if (
    /^Nokko: .+(?:(?: Rewards)? \(Steel Path\)| Rewards), Rotation [ABC]$/u.test(
      location,
    )
  )
    return {
      sourceId: "warframe-wiki-missions",
      namespace: "mission-name",
      value: "Deepmines",
    } as const;
  return undefined;
}
function weaponClassFor(
  item: Pick<WfcdItem, "category" | "type" | "productCategory">,
): WeaponClass | undefined {
  if (item.type === "Kitgun Component") return "kitgun";
  if (item.type === "Zaw Component") return "zaw";
  if (item.type === "Companion Weapon" || item.category === "SentinelWeapons")
    return "companion";
  if (item.productCategory === "OperatorAmps") return "amp";
  if (item.category === "Arch-Gun") return "archgun";
  if (item.category === "Arch-Melee") return "archmelee";
  if (item.category === "Secondary") return "secondary";
  if (item.category === "Melee") return "melee";
  if (item.category === "Primary" && item.type === "Bow") return "bow";
  if (item.category === "Primary" && item.type === "Shotgun") return "shotgun";
  if (item.category === "Primary") return "primary";
  return undefined;
}

function modularPartRoleFor(
  item: Pick<WfcdItem, "uniqueName" | "type">,
): ModularPartRole | undefined {
  if (item.type !== "Kitgun Component" && item.type !== "Zaw Component")
    return undefined;
  const path = item.uniqueName ?? "";
  if (item.type === "Kitgun Component") {
    if (/\/Barrel\//.test(path)) return "kitgun-chamber";
    if (/\/Handles?\//.test(path)) return "kitgun-grip";
    if (/\/Clip\//.test(path)) return "kitgun-loader";
  } else {
    if (/\/Tips?\//.test(path)) return "zaw-strike";
    if (/\/Handles?\//.test(path)) return "zaw-grip";
    if (/\/Balance\//.test(path)) return "zaw-link";
  }
  throw new Error(
    `WFCD ${item.type} ${item.uniqueName ?? "without an ID"} has an unknown part role`,
  );
}
function cleanName(value: string): string {
  return value.replace(/^<[^>]+>\s*/, "").trim();
}

function sharedComponentName(component: WfcdComponent): string {
  const rawName = cleanName(component.name!);
  const tail = externalTail(component.uniqueName!)
    .replace(/Component$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return (
    tail && normalizedAlias(tail).includes(normalizedAlias(rawName))
      ? tail
      : `${rawName} (${externalTail(component.uniqueName!)})`
  ).trim();
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function canonicalNamesForItems(items: WfcdItem[]): Map<string, string> {
  const result = new Map(
    items
      .filter((item) => item.uniqueName && item.name)
      .map((item) => [item.uniqueName!, cleanName(item.name!)]),
  );
  const groups = new Map<string, WfcdItem[]>();
  for (const item of items) {
    if (!item.uniqueName || !item.name) continue;
    const key = `${kindFor(item)}:${normalizedAlias(cleanName(item.name))}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const signatures = new Set(
      group.map((item) => `${item.category ?? ""}\0${item.type ?? ""}`),
    );
    if (signatures.size === 1) continue;
    const candidates = group.map(
      (item) =>
        `${cleanName(item.name!)} (${item.type ?? item.category ?? externalTail(item.uniqueName!)})`,
    );
    const counts = new Map<string, number>();
    for (const candidate of candidates)
      counts.set(
        normalizedAlias(candidate),
        (counts.get(normalizedAlias(candidate)) ?? 0) + 1,
      );
    for (const [index, item] of group.entries()) {
      const candidate = candidates[index]!;
      result.set(
        item.uniqueName!,
        counts.get(normalizedAlias(candidate)) === 1
          ? candidate
          : `${candidate} ${externalTail(item.uniqueName!)}`,
      );
    }
  }
  return result;
}

function externalTail(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? "item";
}
