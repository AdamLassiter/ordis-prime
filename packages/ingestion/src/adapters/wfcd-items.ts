import type { EntityKind, EntityObservation, Observation } from "@ordis-prime/domain";
import { createSnapshot, type Snapshot, type SourceAdapter } from "../adapter.ts";

interface WfcdItem { uniqueName?: string; name?: string; description?: string; category?: string; type?: string; wikiaUrl?: string; components?: WfcdComponent[]; systemName?: string; minEnemyLevel?: number; maxEnemyLevel?: number; masteryReq?: number; nodeType?: number }
interface WfcdComponent { uniqueName?: string; name?: string; description?: string; category?: string; type?: string; itemCount?: number }
const categories: Record<string, EntityKind> = { Warframes: "warframe", Primary: "weapon", Secondary: "weapon", Melee: "weapon", "Arch-Gun": "weapon", "Arch-Melee": "weapon", SentinelWeapons: "weapon", Mods: "mod", Arcanes: "arcane", Resources: "resource", Fish: "resource", Relics: "relic", Node: "node", Quests: "quest", Pets: "companion", Sentinels: "companion", Components: "component", Enemy: "enemy" };
export const DEFAULT_WFCD_ITEMS_URL = "https://api.warframestat.us/items";
const PARSER_VERSION = "wfcd-items-v3";
const ARCHON_SHARD_PREFIX = "/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystal";

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
    for (const [index, item] of items.entries()) {
      if (!item.uniqueName || !item.name) continue;
      const kind = kindFor(item);
      const evidence = { sourceId: this.source.id, sourceRecordKey: item.uniqueName, snapshotVersion: snapshot.version, retrievedAt: snapshot.retrievedAt, citationUrl: item.wikiaUrl, license: this.source.license, path: `[${index}]` };
      const name = cleanName(item.name);
      yield { type: "entity", kind, externalIds: [{ sourceId: this.source.id, namespace: "uniqueName", value: item.uniqueName }], fields: { name, slug: slugify(name), description: item.description }, evidence };
      if (kind === "node" && item.systemName) yield {
        type: "node-detail", nodeExternalId: { sourceId: this.source.id, namespace: "uniqueName", value: item.uniqueName }, planet: item.systemName,
        minimumEnemyLevel: item.minEnemyLevel, maximumEnemyLevel: item.maxEnemyLevel,
        masteryRequirement: item.masteryReq, nodeType: item.nodeType, evidence: { ...evidence, path: `[${index}]` },
      };
      const components = (item.components ?? []).filter((component) => component.uniqueName && component.name);
      for (const [componentIndex, component] of components.entries()) {
        const componentKind = kindFor(component, "component");
        const componentName = componentKind === "component" ? `${item.name} ${component.name}` : component.name!;
        yield { type: "entity", kind: componentKind, externalIds: [{ sourceId: this.source.id, namespace: "uniqueName", value: component.uniqueName! }], fields: { name: componentName, slug: slugify(componentName), description: component.description }, evidence: { ...evidence, sourceRecordKey: component.uniqueName!, path: `[${index}].components[${componentIndex}]` } };
      }
      if (components.length) yield { type: "recipe", outputExternalId: { sourceId: this.source.id, namespace: "uniqueName", value: item.uniqueName }, ingredients: components.map((component) => ({ externalId: { sourceId: this.source.id, namespace: "uniqueName", value: component.uniqueName! }, quantity: component.itemCount ?? 1 })), evidence };
    }
  }
}
function kindFor(item: Pick<WfcdItem, "uniqueName" | "category" | "type">, fallback: EntityKind = "unknown"): EntityKind {
  if (item.uniqueName?.startsWith(ARCHON_SHARD_PREFIX)) return "shard";
  return categories[item.category ?? ""] ?? (item.type === "Blueprint" ? "blueprint" : fallback);
}
function cleanName(value: string): string { return value.replace(/^<[^>]+>\s*/, "").trim(); }
function slugify(value: string) { return value.toLocaleLowerCase("en").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
