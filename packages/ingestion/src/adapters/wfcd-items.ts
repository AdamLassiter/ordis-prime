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

interface WfcdItem {
  uniqueName?: string;
  name?: string;
  description?: string;
  category?: string;
  type?: string;
  productCategory?: string;
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
}
interface WfcdComponent {
  uniqueName?: string;
  name?: string;
  description?: string;
  category?: string;
  type?: string;
  itemCount?: number;
  drops?: WfcdDrop[];
}
interface WfcdDrop {
  location?: string;
  chance?: number;
  rotation?: string;
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
const PARSER_VERSION = "wfcd-items-v14";
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
    for (const item of items)
      for (const component of item.components ?? []) {
        if (component.uniqueName)
          componentOccurrences.set(
            component.uniqueName,
            (componentOccurrences.get(component.uniqueName) ?? 0) + 1,
          );
      }
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
      const name = canonicalNames.get(item.uniqueName) ?? cleanName(item.name);
      yield {
        type: "entity",
        kind,
        externalIds: [
          {
            sourceId: this.source.id,
            namespace: "uniqueName",
            value: item.uniqueName,
          },
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

function* dropObservations(
  item: Pick<WfcdItem, "drops">,
  rewardId: string,
  evidence: EntityObservation["evidence"],
  path: string,
): Generator<Observation> {
  for (const [index, drop] of (item.drops ?? []).entries()) {
    if (!drop.location) continue;
    yield {
      type: "drop",
      rewardExternalId: {
        sourceId: "wfcd-items",
        namespace: "uniqueName",
        value: rewardId,
      },
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
