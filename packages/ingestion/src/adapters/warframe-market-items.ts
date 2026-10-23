import type { EntityKind, Observation } from "@ordis-prime/domain";
import {
  createSnapshot,
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";

export const DEFAULT_WARFRAME_MARKET_ITEMS_URL =
  "https://api.warframe.market/v2/items";
const PARSER_VERSION = "warframe-market-items-v1";

interface MarketItem {
  id?: unknown;
  slug?: unknown;
  gameRef?: unknown;
  tags?: unknown;
  i18n?: unknown;
}

interface MarketPayload {
  apiVersion?: unknown;
  data?: unknown;
  error?: unknown;
}

export class WarframeMarketItemsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.8;
  readonly source = {
    id: "warframe-market-items",
    name: "Warframe.market tradable items",
    homepage: "https://docs.warframe.market/docs/api/items/",
    priority: 20,
  };
  private readonly url: string;

  constructor(url = DEFAULT_WARFRAME_MARKET_ITEMS_URL) {
    this.url = url;
  }

  async fetch(context: FetchContext): Promise<Snapshot> {
    const response = await fetch(this.url, {
      signal: context.signal,
      headers: {
        Accept: "application/json",
        Language: "en",
        "User-Agent":
          "OrdisPrime/0.1 (+https://gitea-infra.lassiter.uk/adaml/ordis-prime)",
      },
    });
    if (!response.ok)
      throw new Error(`Warframe.market items fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const payload = parsePayload(bytes);
    const apiVersion = requiredString(payload.apiVersion, "apiVersion");
    return createSnapshot({
      sourceId: this.source.id,
      version: `${PARSER_VERSION}:${apiVersion}`,
      retrievedAt: new Date().toISOString(),
      mediaType: "application/json",
      bytes,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const payload = parsePayload(snapshot.bytes);
    if (!Array.isArray(payload.data))
      throw new Error("Warframe.market items payload has no data array");
    const byGameRef = new Map<
      string,
      Array<{
        id: string;
        slug: string;
        gameRef: string;
        tags: string[];
        name: string;
        index: number;
      }>
    >();
    for (const [index, raw] of payload.data.entries()) {
      if (!raw || typeof raw !== "object")
        throw new Error(`Warframe.market item ${index} is not an object`);
      const item = raw as MarketItem;
      const id = requiredString(item.id, `item ${index} id`);
      const slug = requiredString(item.slug, `item ${index} slug`);
      const gameRef = optionalString(item.gameRef);
      const tags = stringArray(item.tags, `item ${index} tags`);
      const name = englishName(item.i18n);
      if (!gameRef || !name) continue;
      const group = byGameRef.get(gameRef) ?? [];
      group.push({ id, slug, gameRef, tags, name, index });
      byGameRef.set(gameRef, group);
    }
    for (const [gameRef, group] of byGameRef) {
      const preferred =
        group.find(({ tags }) => !tags.includes("set")) ?? group[0]!;
      yield {
        type: "entity",
        kind: preferredKind(
          group.map(({ tags, gameRef }) => marketKind(tags, gameRef)),
        ),
        externalIds: [
          ...group.flatMap(({ id, slug }) => [
            { sourceId: this.source.id, namespace: "item-id", value: id },
            { sourceId: this.source.id, namespace: "item-slug", value: slug },
          ]),
          { sourceId: "wfcd-items", namespace: "uniqueName", value: gameRef },
        ],
        fields: { name: preferred.name, slug: preferred.slug },
        evidence: {
          sourceId: this.source.id,
          sourceRecordKey: group
            .map(({ id }) => id)
            .sort()
            .join(","),
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
          citationUrl: `https://warframe.market/items/${encodeURIComponent(preferred.slug)}`,
          path: group.map(({ index }) => `data[${index}]`).join(","),
        },
      };
    }
    if (byGameRef.size < 1_000)
      throw new Error(
        `Warframe.market items payload retained only ${byGameRef.size} usable item identities`,
      );
  }
}

function preferredKind(kinds: EntityKind[]): EntityKind {
  return kinds.find((kind) => kind !== "unknown") ?? "unknown";
}

function parsePayload(bytes: Uint8Array): MarketPayload {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Warframe.market items payload is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Warframe.market items payload is not an object");
  const payload = value as MarketPayload;
  if (payload.error)
    throw new Error("Warframe.market items payload has an error");
  return payload;
}

function marketKind(tags: string[], gameRef: string): EntityKind {
  const values = new Set(tags);
  if (values.has("mod")) return "mod";
  if (values.has("arcane_enhancement")) return "arcane";
  if (values.has("set") || values.has("component") || values.has("blueprint"))
    return "unknown";
  if (gameRef.includes("PetParts/")) return "resource";
  if (
    values.has("weapon") ||
    values.has("primary") ||
    values.has("secondary") ||
    values.has("melee") ||
    values.has("archgun") ||
    values.has("archmelee")
  )
    return "weapon";
  if (values.has("archwing")) return "archwing";
  if (values.has("warframe")) return "warframe";
  if (values.has("companion") || values.has("sentinel") || values.has("pet"))
    return "companion";
  if (values.has("relic")) return "relic";
  if (values.has("fish") || values.has("gem")) return "resource";
  return "unknown";
}

function englishName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const english = (value as Record<string, unknown>).en;
  if (!english || typeof english !== "object" || Array.isArray(english)) return;
  return optionalString((english as Record<string, unknown>).name);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
    throw new Error(`Warframe.market ${label} is invalid`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(`Warframe.market ${label} is missing`);
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
