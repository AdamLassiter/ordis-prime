import { type EntityKind, type Observation } from "@ordis-prime/domain";
import {
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";
import {
  DEFAULT_WARFRAME_WIKI_API_URL,
  fetchMediaWikiLuaSnapshot,
  luaFieldKey,
  luaLiteralField,
  luaLiteralValue,
  luaStringValue,
  parseLuaReturnTable,
  readMediaWikiLuaPages,
  wikiRevisionUrl,
  wikiSlug,
} from "./mediawiki-lua.ts";
import { parseEquipmentPolarities } from "./wiki-equipment-polarities.ts";

const PARSER_VERSION = "warframe-wiki-warframes-v6";
const MODULE_TITLE = "Module:Warframes/data";
const GROUPS = [
  { field: "Warframes", kind: "warframe", expectedType: "Warframe" },
  { field: "Archwings", kind: "archwing", expectedType: "Archwing" },
] as const satisfies ReadonlyArray<{
  field: string;
  kind: EntityKind;
  expectedType: string;
}>;

export class WarframeWikiWarframesAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-warframes",
    name: "WARFRAME Wiki Warframe data",
    homepage: "https://wiki.warframe.com/w/Module:Warframes/data",
    license: "CC BY-NC-SA 3.0",
    priority: 80,
  };
  private readonly apiUrl: string;

  constructor(apiUrl = DEFAULT_WARFRAME_WIKI_API_URL) {
    this.apiUrl = apiUrl;
  }

  async fetch(context: FetchContext): Promise<Snapshot> {
    return fetchMediaWikiLuaSnapshot({
      apiUrl: this.apiUrl,
      moduleTitles: [MODULE_TITLE],
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
      cacheDirectory: context.cacheDirectory,
      cacheMaxAgeMilliseconds: context.cacheMaxAgeMilliseconds,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const page = readMediaWikiLuaPages(snapshot.bytes, [MODULE_TITLE])[0]!;
    const root = parseLuaReturnTable(page.content, page.title);
    for (const group of GROUPS) {
      const groupTable = luaLiteralField(root, group.field);
      if (groupTable?.type !== "TableConstructorExpression")
        throw new Error(
          `WARFRAME Wiki ${MODULE_TITLE} has no ${group.field} table`,
        );
      let count = 0;
      for (const field of groupTable.fields) {
        if (field.type === "TableValue") continue;
        const key = luaFieldKey(field);
        if (!key || field.value.type !== "TableConstructorExpression") continue;
        const ignored = luaLiteralField(field.value, "_IgnoreEntry");
        if (ignored?.type === "BooleanLiteral" && ignored.value) continue;
        const maxRank = luaLiteralField(field.value, "MaxRank");
        if (maxRank === undefined) continue;
        if (
          maxRank.type !== "NumericLiteral" ||
          !Number.isSafeInteger(maxRank.value) ||
          maxRank.value < 30 ||
          maxRank.value > 40
        )
          throw new Error(
            `WARFRAME Wiki ${group.field} record ${key} has invalid MaxRank`,
          );
        const nameField = luaLiteralField(field.value, "Name");
        const typeField = luaLiteralField(field.value, "Type");
        if (luaStringValue(typeField) !== group.expectedType)
          throw new Error(
            `WARFRAME Wiki ${group.field} record ${key} has invalid Type`,
          );
        const name = luaStringValue(nameField)?.trim() || key;
        const description = luaStringValue(
          luaLiteralField(field.value, "Description"),
        )?.trim();
        const externalId = {
          sourceId: this.source.id,
          namespace: "module-record",
          value: `${group.field}:${key}`,
        };
        const recordKey = `${group.field}:${key}`;
        const recordEvidence = {
          sourceId: this.source.id,
          sourceRecordKey: recordKey,
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
          citationUrl: wikiRevisionUrl(page.title, page.revisionId),
          license: this.source.license,
          path: field.loc?.start.line
            ? `${page.title}:${field.loc.start.line}`
            : page.title,
        };
        count += 1;
        yield {
          type: "entity",
          kind: group.kind,
          externalIds: [externalId],
          aliases: key === name ? undefined : [key],
          fields: {
            name,
            slug: wikiSlug(name),
            description,
            equipmentMaxRank: maxRank.value,
          },
          evidence: recordEvidence,
        };
        for (const attribute of warframeAttributes(field.value))
          yield {
            type: "entity-attribute",
            subjectExternalId: externalId,
            key: attribute.key,
            label: attribute.label,
            value: attribute.value,
            evidence: {
              ...recordEvidence,
              sourceRecordKey: `${recordKey}:${attribute.key}`,
            },
          };
        yield {
          type: "equipment-polarity-set",
          subjectExternalId: externalId,
          polarities: parseEquipmentPolarities(
            field.value,
            `WARFRAME Wiki ${group.kind} ${name}`,
            [
              { field: "AuraPolarity", role: "aura" },
              { field: "ExilusPolarity", role: "exilus" },
            ],
          ),
          evidence: {
            ...recordEvidence,
            sourceRecordKey: `${recordKey}:factory-polarities`,
          },
        };
      }
      if (!count)
        throw new Error(
          `WARFRAME Wiki ${MODULE_TITLE} has no ranked ${group.field} records`,
        );
    }
  }
}

function warframeAttributes(
  record: Parameters<typeof luaLiteralField>[0],
): Array<{ key: string; label: string; value: string }> {
  const numeric = [
    ["Health", "health", "Health"],
    ["Shield", "shield", "Shield"],
    ["Armor", "armor", "Armor"],
    ["Energy", "energy", "Energy"],
    ["Sprint", "sprint-speed", "Sprint speed"],
  ] as const;
  const attributes: Array<{ key: string; label: string; value: string }> =
    numeric.flatMap(([field, key, label]) => {
      const value = luaLiteralField(record, field);
      return value?.type === "NumericLiteral"
        ? [{ key, label, value: String(value.value) }]
        : [];
    });
  const passive = luaStringValue(luaLiteralField(record, "Passive"))?.trim();
  if (passive)
    attributes.push({ key: "passive", label: "Passive", value: passive });
  const handled = new Set([
    "Armor",
    "Energy",
    "Health",
    "Passive",
    "Shield",
    "Sprint",
  ]);
  const omitted = new Set([
    "Abilities",
    "AuraPolarity",
    "Description",
    "ExilusPolarity",
    "FullImages",
    "Image",
    "InternalName",
    "Link",
    "MaxRank",
    "Name",
    "Polarities",
    "Portrait",
    "Type",
  ]);
  for (const field of record.fields) {
    if (field.type === "TableValue") continue;
    const name = luaFieldKey(field);
    if (!name || name.startsWith("_") || handled.has(name) || omitted.has(name))
      continue;
    const value = luaLiteralValue(field.value);
    const rendered = renderSimpleAttribute(value);
    if (rendered !== undefined)
      attributes.push({
        key: wikiAttributeKey(name),
        label: wikiAttributeLabel(name),
        value: rendered,
      });
  }
  return attributes;
}

function renderSimpleAttribute(
  value: ReturnType<typeof luaLiteralValue>,
): string | undefined {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((entry) =>
      ["string", "number", "boolean"].includes(typeof entry),
    )
  )
    return value.map(String).join(", ");
  return undefined;
}

function wikiAttributeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .toLocaleLowerCase("en");
}

function wikiAttributeLabel(value: string): string {
  const known: Record<string, string> = {
    CodexSecret: "Hidden in Codex",
    HealthRank30: "Health at rank 30",
    InitialEnergy: "Starting energy",
    ShieldRank30: "Shield at rank 30",
    SellPrice: "Sell price",
  };
  return (
    known[value] ??
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z])([0-9])/g, "$1 $2")
      .replace(/^./, (character) => character.toUpperCase())
  );
}
