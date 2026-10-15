import { normalizedAlias, type ArcaneClass, type EntityKind, type EntityObservation, type Observation, type WeaponClass } from "@ordis-prime/domain";
import { createSnapshot, type Snapshot, type SourceAdapter } from "../adapter.ts";

interface WfcdItem { uniqueName?: string; name?: string; description?: string; category?: string; type?: string; productCategory?: string; wikiaUrl?: string; components?: WfcdComponent[]; systemName?: string; minEnemyLevel?: number; maxEnemyLevel?: number; masteryReq?: number; nodeType?: number }
interface WfcdComponent { uniqueName?: string; name?: string; description?: string; category?: string; type?: string; itemCount?: number }
const categories: Record<string, EntityKind> = { Warframes: "warframe", Primary: "weapon", Secondary: "weapon", Melee: "weapon", "Arch-Gun": "weapon", "Arch-Melee": "weapon", SentinelWeapons: "weapon", Archwing: "archwing", Mods: "mod", Arcanes: "arcane", Resources: "resource", Fish: "resource", Relics: "relic", Node: "node", Quests: "quest", Pets: "companion", Sentinels: "companion", Components: "component", Enemy: "enemy" };
export const DEFAULT_WFCD_ITEMS_URL = "https://api.warframestat.us/items";
const PARSER_VERSION = "wfcd-items-v6";
const ARCHON_SHARD_PREFIX = "/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal";
const resourceTypes = new Set(["Resource", "Equipment Adapter", "Pet Resource", "Alloy", "Currency", "Fish Part", "Conservation Tag", "Cut Gem", "Eidolon Shard", "Medallion", "Focus Lens", "Ayatan Star", "Ayatan Sculpture"]);
const arcaneClasses: Record<string, ArcaneClass> = {
  "Arcane": "warframe",
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
  readonly source = { id: "wfcd-items", name: "WFCD warframe-items", homepage: "https://github.com/WFCD/warframe-items", license: "MIT", priority: 100 };
  private readonly url: string;
  constructor(url = DEFAULT_WFCD_ITEMS_URL) { this.url = url; }
  async fetch(context: { signal?: AbortSignal }): Promise<Snapshot> {
    const response = await fetch(this.url, { signal: context.signal, headers: { "User-Agent": "OrdisPrime/0.1 (+https://github.com/adamlassiter/ordis-prime)" } });
    if (!response.ok) throw new Error(`WFCD items fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const upstreamVersion = response.headers.get("etag") ?? new Date().toISOString();
    return createSnapshot({ sourceId: this.source.id, version: `${upstreamVersion}|${PARSER_VERSION}`, retrievedAt: new Date().toISOString(), mediaType: "application/json", bytes });
  }
  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const items = JSON.parse(new TextDecoder().decode(snapshot.bytes)) as WfcdItem[];
    if (!Array.isArray(items)) throw new Error("WFCD items payload must be an array");
    const declaredItems = new Map(items.filter((item) => item.uniqueName).map((item) => [item.uniqueName!, item]));
    const canonicalNames = canonicalNamesForItems([...declaredItems.values()]);
    const componentOccurrences = new Map<string, number>();
    for (const item of items) for (const component of item.components ?? []) {
      if (component.uniqueName) componentOccurrences.set(component.uniqueName, (componentOccurrences.get(component.uniqueName) ?? 0) + 1);
    }
    for (const [index, item] of items.entries()) {
      if (!item.uniqueName || !item.name) continue;
      const kind = kindFor(item);
      const evidence = { sourceId: this.source.id, sourceRecordKey: item.uniqueName, snapshotVersion: snapshot.version, retrievedAt: snapshot.retrievedAt, citationUrl: item.wikiaUrl, license: this.source.license, path: `[${index}]` };
      const name = canonicalNames.get(item.uniqueName) ?? cleanName(item.name);
      yield { type: "entity", kind, externalIds: [{ sourceId: this.source.id, namespace: "uniqueName", value: item.uniqueName }], fields: { name, slug: slugify(name), description: item.description, arcaneClass: kind === "arcane" ? arcaneClasses[item.type ?? ""] : undefined, weaponClass: kind === "weapon" ? weaponClassFor(item) : undefined }, evidence };
      if (kind === "node" && item.systemName) yield {
        type: "node-detail", nodeExternalId: { sourceId: this.source.id, namespace: "uniqueName", value: item.uniqueName }, planet: item.systemName,
        minimumEnemyLevel: item.minEnemyLevel, maximumEnemyLevel: item.maxEnemyLevel,
        masteryRequirement: item.masteryReq, nodeType: item.nodeType, evidence: { ...evidence, path: `[${index}]` },
      };
      const components = (item.components ?? []).filter((component) => component.uniqueName && component.name);
      for (const [componentIndex, component] of components.entries()) {
        const declared = declaredItems.get(component.uniqueName!);
        const shared = (componentOccurrences.get(component.uniqueName!) ?? 0) > 1;
        const componentKind = declared ? kindFor(declared) : shared && component.category === "Misc" ? "resource" : kindFor(component, "component");
        const componentName = declared?.name ? canonicalNames.get(component.uniqueName!) ?? cleanName(declared.name) : componentKind === "component" && !shared ? `${item.name} ${component.name}` : component.name!;
        yield { type: "entity", kind: componentKind, externalIds: [{ sourceId: this.source.id, namespace: "uniqueName", value: component.uniqueName! }], fields: { name: componentName, slug: slugify(componentName), description: declared?.description ?? component.description }, evidence: { ...evidence, sourceRecordKey: component.uniqueName!, path: `[${index}].components[${componentIndex}]` } };
      }
      if (components.length) yield { type: "recipe", outputExternalId: { sourceId: this.source.id, namespace: "uniqueName", value: item.uniqueName }, ingredients: components.map((component) => ({ externalId: { sourceId: this.source.id, namespace: "uniqueName", value: component.uniqueName! }, quantity: component.itemCount ?? 1 })), evidence };
    }
  }
}
function kindFor(item: Pick<WfcdItem, "uniqueName" | "category" | "type">, fallback: EntityKind = "unknown"): EntityKind {
  if (item.uniqueName?.startsWith(ARCHON_SHARD_PREFIX)) return "shard";
  if (item.type && resourceTypes.has(item.type)) return "resource";
  if (item.type === "Kitgun Component") return item.uniqueName?.includes("/Barrel/") ? "weapon" : "component";
  if (item.type === "Zaw Component") return item.uniqueName?.includes("/Tip/") ? "weapon" : "component";
  return categories[item.category ?? ""] ?? (item.type === "Blueprint" ? "blueprint" : fallback);
}
function weaponClassFor(item: Pick<WfcdItem, "category" | "type" | "productCategory">): WeaponClass | undefined {
  if (item.type === "Kitgun Component") return "kitgun";
  if (item.type === "Zaw Component") return "zaw";
  if (item.type === "Companion Weapon" || item.category === "SentinelWeapons") return "companion";
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
function cleanName(value: string): string { return value.replace(/^<[^>]+>\s*/, "").trim(); }
function slugify(value: string) { return value.toLocaleLowerCase("en").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

function canonicalNamesForItems(items: WfcdItem[]): Map<string, string> {
  const result = new Map(items.filter((item) => item.uniqueName && item.name).map((item) => [item.uniqueName!, cleanName(item.name!)]));
  const groups = new Map<string, WfcdItem[]>();
  for (const item of items) {
    if (!item.uniqueName || !item.name) continue;
    const key = `${kindFor(item)}:${normalizedAlias(cleanName(item.name))}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const signatures = new Set(group.map((item) => `${item.category ?? ""}\0${item.type ?? ""}`));
    if (signatures.size === 1) continue;
    const candidates = group.map((item) => `${cleanName(item.name!)} (${item.type ?? item.category ?? externalTail(item.uniqueName!)})`);
    const counts = new Map<string, number>();
    for (const candidate of candidates) counts.set(normalizedAlias(candidate), (counts.get(normalizedAlias(candidate)) ?? 0) + 1);
    for (const [index, item] of group.entries()) {
      const candidate = candidates[index]!;
      result.set(item.uniqueName!, counts.get(normalizedAlias(candidate)) === 1 ? candidate : `${candidate} ${externalTail(item.uniqueName!)}`);
    }
  }
  return result;
}

function externalTail(value: string): string {
  return value.split("/").filter(Boolean).at(-1) ?? "item";
}
