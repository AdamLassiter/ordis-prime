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
  luaStringValue,
  parseLuaReturnTable,
  readMediaWikiLuaPages,
  wikiRevisionUrl,
  wikiSlug,
} from "./mediawiki-lua.ts";
import { parseEquipmentPolarities } from "./wiki-equipment-polarities.ts";

const PARSER_VERSION = "warframe-wiki-warframes-v4";
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
            equipmentMaxRank: maxRank.value,
          },
          evidence: recordEvidence,
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
