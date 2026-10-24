import type {
  EntityKind,
  ExternalIdentifier,
  Observation,
} from "@ordis-prime/domain";
import type { Expression, TableConstructorExpression } from "luaparse";
import {
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";
import {
  DEFAULT_WARFRAME_WIKI_API_URL,
  fetchMediaWikiPagesSnapshot,
  luaFieldKey,
  luaLiteralField,
  luaStringValue,
  parseLuaReturnTable,
  readMediaWikiPages,
  wikiRevisionUrl,
  wikiSlug,
} from "./mediawiki-lua.ts";

const PARSER_VERSION = "warframe-wiki-vendors-v5";
const VENDOR_MODULE = "Module:Vendors/data";
const NIGHTCAP_PAGE = "Nightcap";

interface Offering {
  name: string;
  kind: EntityKind;
  cost: string;
  quantity: number;
  prerequisite?: string;
  numericCost?: number;
  prerequisiteRank?: number;
  line?: number;
}

export class WarframeWikiVendorsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-vendors",
    name: "WARFRAME Wiki vendor data",
    homepage: "https://wiki.warframe.com/w/Module:Vendors/data",
    license: "CC BY-NC-SA 3.0",
    priority: 80,
  };
  private readonly apiUrl: string;

  constructor(apiUrl = DEFAULT_WARFRAME_WIKI_API_URL) {
    this.apiUrl = apiUrl;
  }

  async fetch(context: FetchContext): Promise<Snapshot> {
    return fetchMediaWikiPagesSnapshot({
      apiUrl: this.apiUrl,
      pageTitles: [VENDOR_MODULE, NIGHTCAP_PAGE],
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
      cacheDirectory: context.cacheDirectory,
      cacheMaxAgeMilliseconds: context.cacheMaxAgeMilliseconds,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const [modulePage, nightcapPage] = readMediaWikiPages(snapshot.bytes, [
      VENDOR_MODULE,
      NIGHTCAP_PAGE,
    ]);
    const root = parseLuaReturnTable(modulePage!.content, modulePage!.title);
    const vendors = luaLiteralField(root, "Vendors");
    if (vendors?.type !== "TableConstructorExpression")
      throw new Error(`WARFRAME Wiki ${VENDOR_MODULE} has no Vendors table`);

    let vendorCount = 0;
    let offeringCount = 0;
    for (const field of vendors.fields) {
      if (
        field.type === "TableValue" ||
        field.value.type !== "TableConstructorExpression"
      )
        continue;
      const key = luaFieldKey(field);
      if (!key) continue;
      const name =
        luaStringValue(luaLiteralField(field.value, "Name"))?.trim() || key;
      const currency = luaStringValue(
        luaLiteralField(field.value, "Currency"),
      )?.trim();
      // Standing offerings are useful without claiming a physical location.
      // Other vendors remain excluded unless an independently cited location
      // is available.
      if (key !== "Nightcap" && currency !== "Standing") continue;
      const offerings = parseOfferings(field.value, name, currency);
      const vendorId = vendorExternalId(key);
      vendorCount += 1;
      yield {
        type: "entity",
        kind: "vendor",
        externalIds: [vendorId],
        aliases: key === name ? undefined : [key],
        fields: {
          name,
          slug: wikiSlug(name),
          description: currency
            ? `${name} offers ${offerings.length} catalogued items for ${currency}.`
            : `${name} offers ${offerings.length} catalogued items.`,
        },
        evidence: evidence(
          snapshot,
          modulePage!.title,
          modulePage!.revisionId,
          `Vendors:${key}`,
          field.loc?.start.line,
        ),
      };
      if (currency)
        yield {
          type: "entity-attribute",
          subjectExternalId: vendorId,
          key: "currency",
          label: "Currency",
          value: currency,
          evidence: evidence(
            snapshot,
            modulePage!.title,
            modulePage!.revisionId,
            `Vendors:${key}:currency`,
            field.loc?.start.line,
          ),
        };
      for (const [index, offering] of offerings.entries()) {
        offeringCount += 1;
        const offeringId = offeringExternalId(offering.name, offering.kind);
        const canonicalName = canonicalOfferingName(
          offering.name,
          offering.kind,
        );
        yield {
          type: "entity",
          kind: offering.kind,
          externalIds: [offeringId],
          fields: { name: canonicalName, slug: wikiSlug(canonicalName) },
          evidence: evidence(
            snapshot,
            modulePage!.title,
            modulePage!.revisionId,
            `Vendors:${key}:offering:${index}`,
            offering.line,
          ),
        };
        yield {
          type: "entity-relation",
          kind: "offers",
          fromExternalId: vendorId,
          toExternalId: offeringId,
          notes: `${offering.quantity} for ${offering.cost}${offering.prerequisite === undefined ? "" : ` · requires ${offering.prerequisite}`}`,
          evidence: evidence(
            snapshot,
            modulePage!.title,
            modulePage!.revisionId,
            `Vendors:${key}:offering:${index}`,
            offering.line,
          ),
        };
        if (currency === "Standing" && offering.numericCost !== undefined)
          yield {
            type: "vendor-offering",
            vendorExternalId: vendorId,
            itemExternalId: offeringId,
            faction: standingFaction(key, name),
            currency,
            cost: offering.numericCost,
            quantity: offering.quantity,
            prerequisiteRank: offering.prerequisiteRank,
            prerequisiteLabel: offering.prerequisite,
            evidence: evidence(
              snapshot,
              modulePage!.title,
              modulePage!.revisionId,
              `Vendors:${key}:offering:${index}:structured`,
              offering.line,
            ),
          };
      }
    }
    if (!vendorCount || !offeringCount)
      throw new Error(
        `WARFRAME Wiki ${VENDOR_MODULE} has no current vendor offerings`,
      );

    yield {
      type: "entity-relation",
      kind: "occurs-at",
      fromExternalId: vendorExternalId("Nightcap"),
      toExternalId: {
        sourceId: "warframe-wiki-missions",
        namespace: "mission-name",
        value: "Fortuna",
      },
      notes: "Nightcap operates from Fortuna and offers Deepmines bounties.",
      evidence: evidence(
        snapshot,
        nightcapPage!.title,
        nightcapPage!.revisionId,
        "Nightcap:location",
      ),
    };
  }
}

function parseOfferings(
  vendor: TableConstructorExpression,
  vendorName: string,
  currency?: string,
): Offering[] {
  const table = luaLiteralField(vendor, "Offerings");
  if (table === undefined) return [];
  if (table.type !== "TableConstructorExpression")
    throw new Error(`WARFRAME Wiki vendor ${vendorName} has invalid Offerings`);
  return table.fields.flatMap((field, index) => {
    if (
      field.type !== "TableValue" ||
      field.value.type !== "TableConstructorExpression"
    )
      throw new Error(
        `WARFRAME Wiki vendor ${vendorName} offering ${index} is invalid`,
      );
    const positional = field.value.fields.filter(
      (entry) => entry.type === "TableValue",
    );
    const name = luaStringValue(positional[0]?.value)?.trim();
    const rawKind = luaStringValue(positional[1]?.value)?.trim();
    const cost = formatCost(positional[2]?.value, currency);
    const numericCost = numberValue(positional[2]?.value);
    const quantity = numberValue(positional[3]?.value) ?? 1;
    const prerequisite = formatPrerequisite(
      luaLiteralField(field.value, "Prereq"),
    );
    const prerequisiteRank = numberValue(
      luaLiteralField(field.value, "Prereq"),
    );
    if (!name || !rawKind || cost === undefined || quantity <= 0)
      throw new Error(
        `WARFRAME Wiki vendor ${vendorName} offering ${index} is incomplete`,
      );
    return [
      {
        name,
        kind: offeringKind(rawKind),
        cost,
        quantity,
        prerequisite,
        numericCost,
        prerequisiteRank,
        line: field.loc?.start.line,
      },
    ];
  });
}

const STANDING_FACTIONS: Record<string, string> = {
  "Arbiters of Hexis": "Arbiters of Hexis",
  "Cephalon Suda": "Cephalon Suda",
  "New Loka": "New Loka",
  "Red Veil": "Red Veil",
  "Steel Meridian": "Steel Meridian",
  "The Perrin Sequence": "The Perrin Sequence",
  "Bird 3": "Cavia",
  Cavalero: "The Holdfasts",
  "Cephalon Simaris": "Cephalon Simaris",
  Chipper: "Kahl's Garrison",
  Father: "Entrati",
  Hok: "Ostron",
  "Little Duck": "Vox Solaris",
  Loid: "Necraloid",
  Onkko: "The Quills",
  Otak: "Entrati",
  Roky: "Ventkids",
  "Rude Zuud": "Solaris United",
  Son: "Entrati",
  Suumbaat: "Ostron",
  Teshin: "Conclave",
  "The Business": "Solaris United",
};

function standingFaction(key: string, name: string): string {
  return STANDING_FACTIONS[key] ?? STANDING_FACTIONS[name] ?? name;
}

function formatCost(
  expression: Expression | undefined,
  currency?: string,
): string | undefined {
  const numeric = numberValue(expression);
  if (numeric !== undefined)
    return `${numeric.toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
  if (expression?.type !== "TableConstructorExpression") return undefined;
  const parts = expression.fields.flatMap((field) => {
    if (field.type === "TableValue") return [];
    const key = luaFieldKey(field);
    const value = numberValue(field.value);
    return key && value !== undefined
      ? [`${value.toLocaleString("en-US")} ${key}`]
      : [];
  });
  return parts.length ? parts.join(" + ") : undefined;
}

function formatPrerequisite(
  expression: Expression | undefined,
): string | undefined {
  const numeric = numberValue(expression);
  if (numeric !== undefined) return `rank ${numeric}`;
  return luaStringValue(expression)?.trim();
}

function offeringKind(value: string): EntityKind {
  const normalized = value.toLocaleLowerCase("en").replace(/,$/, "");
  if (normalized === "blueprint") return "component";
  if (normalized === "weapon") return "weapon";
  if (normalized === "warframe") return "warframe";
  if (normalized === "companion") return "companion";
  if (normalized === "mod") return "mod";
  if (normalized === "arcane") return "arcane";
  if (normalized === "resource") return "resource";
  if (normalized === "relic") return "relic";
  if (normalized === "decoration") return "decoration";
  if (["item", "key", "gear"].includes(normalized)) return "gear";
  if (
    [
      "captura",
      "color",
      "cosmetic",
      "cosmetics",
      "emote",
      "ephemera",
      "glyph",
      "sigil",
      "skin",
    ].includes(normalized)
  )
    return "cosmetic";
  return "misc";
}

function canonicalOfferingName(name: string, kind: EntityKind): string {
  if (kind !== "component") return name;
  return name.replace(
    /\s+Blueprint$/,
    (suffix, offset: number, source: string) =>
      /\b(Barrel|Blade|Chassis|Handle|Heatsink|Hilt|Neuroptics|Receiver|Stock|Systems)$/i.test(
        source.slice(0, offset),
      )
        ? ""
        : suffix,
  );
}

function numberValue(expression: Expression | undefined): number | undefined {
  return expression?.type === "NumericLiteral" &&
    Number.isFinite(expression.value)
    ? expression.value
    : undefined;
}

function vendorExternalId(key: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-vendors",
    namespace: "vendor-record",
    value: key,
  };
}

function offeringExternalId(
  name: string,
  kind: EntityKind,
): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-vendors",
    namespace: `offering-v2-${kind}`,
    value: name,
  };
}

function evidence(
  snapshot: Snapshot,
  title: string,
  revisionId: number,
  sourceRecordKey: string,
  line?: number,
) {
  return {
    sourceId: "warframe-wiki-vendors",
    sourceRecordKey,
    snapshotVersion: snapshot.version,
    retrievedAt: snapshot.retrievedAt,
    citationUrl: wikiRevisionUrl(title, revisionId),
    license: "CC BY-NC-SA 3.0",
    path: line ? `${title}:${line}` : title,
  };
}
