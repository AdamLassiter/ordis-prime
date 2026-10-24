import type { EntityKind, Observation } from "@ordis-prime/domain";
import {
  createSnapshot,
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";

export const DEFAULT_WARFRAME_MARKET_ITEMS_URL =
  "https://api.warframe.market/v2/items";
const PARSER_VERSION = "warframe-market-items-v2";

interface MarketItem {
  id?: unknown;
  slug?: unknown;
  gameRef?: unknown;
  tags?: unknown;
  i18n?: unknown;
  ducats?: unknown;
  maxRank?: unknown;
  subtypes?: unknown;
  vaulted?: unknown;
  bulkTradable?: unknown;
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
        ducats?: number;
        maxRank?: number;
        subtypes: string[];
        vaulted?: boolean;
        bulkTradable?: boolean;
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
      const ducats = optionalNonNegativeInteger(item.ducats);
      const maxRank = optionalNonNegativeInteger(item.maxRank);
      const subtypes =
        item.subtypes === undefined
          ? []
          : stringArray(item.subtypes, `item ${index} subtypes`);
      const vaulted = optionalBoolean(item.vaulted, `item ${index} vaulted`);
      const bulkTradable = optionalBoolean(
        item.bulkTradable,
        `item ${index} bulkTradable`,
      );
      if (!gameRef || !name) continue;
      const group = byGameRef.get(gameRef) ?? [];
      group.push({
        id,
        slug,
        gameRef,
        tags,
        name,
        index,
        ducats,
        maxRank,
        subtypes,
        vaulted,
        bulkTradable,
      });
      byGameRef.set(gameRef, group);
    }
    for (const [gameRef, group] of byGameRef) {
      const preferred =
        group.find(({ tags }) => !tags.includes("set")) ?? group[0]!;
      for (const item of group) {
        yield {
          type: "entity",
          kind: marketKind(item.tags, item.gameRef),
          externalIds: [
            { sourceId: this.source.id, namespace: "item-id", value: item.id },
            {
              sourceId: this.source.id,
              namespace: "item-slug",
              value: item.slug,
            },
            ...(item === preferred
              ? [
                  {
                    sourceId: "wfcd-items",
                    namespace: "uniqueName",
                    value: gameRef,
                  },
                ]
              : []),
          ],
          fields: { name: item.name, slug: item.slug },
          evidence: {
            sourceId: this.source.id,
            sourceRecordKey: item.id,
            snapshotVersion: snapshot.version,
            retrievedAt: snapshot.retrievedAt,
            citationUrl: `https://warframe.market/items/${encodeURIComponent(item.slug)}`,
            path: `data[${item.index}]`,
          },
        };
        const subjectExternalId = {
          sourceId: this.source.id,
          namespace: "item-id",
          value: item.id,
        };
        const attributes: Array<[string, string, string | undefined]> = [
          ["market-tags", "Warframe.market tags", JSON.stringify(item.tags)],
          [
            "market-subtypes",
            "Market subtypes",
            item.subtypes.length ? JSON.stringify(item.subtypes) : undefined,
          ],
          [
            "ducats",
            "Ducats",
            item.ducats === undefined ? undefined : String(item.ducats),
          ],
          [
            "market-max-rank",
            "Market maximum rank",
            item.maxRank === undefined ? undefined : String(item.maxRank),
          ],
          [
            "vaulted",
            "Vaulted",
            item.vaulted === undefined ? undefined : String(item.vaulted),
          ],
          [
            "bulk-tradable",
            "Bulk tradable",
            item.bulkTradable === undefined
              ? undefined
              : String(item.bulkTradable),
          ],
        ];
        for (const [key, label, value] of attributes) {
          if (value === undefined) continue;
          yield {
            type: "entity-attribute",
            subjectExternalId,
            key,
            label,
            value,
            evidence: {
              sourceId: this.source.id,
              sourceRecordKey: `${item.id}:${key}`,
              snapshotVersion: snapshot.version,
              retrievedAt: snapshot.retrievedAt,
              citationUrl: `https://warframe.market/items/${encodeURIComponent(item.slug)}`,
              path: `data[${item.index}].${key}`,
            },
          };
        }
      }
    }
    if (byGameRef.size < 1_000)
      throw new Error(
        `Warframe.market items payload retained only ${byGameRef.size} usable item identities`,
      );
  }
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

function optionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error("Warframe.market numeric item field is invalid");
  return value as number;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean")
    throw new Error(`Warframe.market ${label} is invalid`);
  return value;
}
