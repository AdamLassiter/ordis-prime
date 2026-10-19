import type {
  EntityRelationObservation,
  ExternalIdentifier,
  Observation,
} from "@ordis-prime/domain";
import type { TableConstructorExpression } from "luaparse";
import {
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";
import {
  DEFAULT_WARFRAME_WIKI_API_URL,
  fetchMediaWikiLuaSnapshot,
  luaLiteralField,
  luaStringValue,
  parseLuaReturnTable,
  readMediaWikiLuaPages,
  wikiRevisionUrl,
  wikiSlug,
} from "./mediawiki-lua.ts";

const PARSER_VERSION = "warframe-wiki-missions-v1";
const MODULE_TITLE = "Module:Missions/data";

interface MissionRecord {
  name: string;
  planet: string;
  missionType?: string;
  faction?: string;
  minimumEnemyLevel?: number;
  maximumEnemyLevel?: number;
  line?: number;
  next: string[];
  previous: string[];
}

export class WarframeWikiMissionsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-missions",
    name: "WARFRAME Wiki mission connections",
    homepage: "https://wiki.warframe.com/w/Module:Missions/data",
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
    const details = luaLiteralField(root, "MissionDetails");
    if (details?.type !== "TableConstructorExpression")
      throw new Error(
        `WARFRAME Wiki ${MODULE_TITLE} has no MissionDetails table`,
      );
    const records = parseMissionRecords(details);
    if (!records.length)
      throw new Error(`WARFRAME Wiki ${MODULE_TITLE} has no mission records`);
    const names = new Set(records.map(({ name }) => name));
    if (names.size !== records.length)
      throw new Error(
        `WARFRAME Wiki ${MODULE_TITLE} has duplicate mission names`,
      );

    for (const record of records) {
      yield {
        type: "entity",
        kind: "node",
        externalIds: [missionExternalId(record.name)],
        fields: { name: record.name, slug: wikiSlug(record.name) },
        evidence: evidence(page.revisionId, snapshot, record.name, record.line),
      };
    }
    for (const record of records) {
      yield {
        type: "node-detail",
        nodeExternalId: missionExternalId(record.name),
        planet: record.planet,
        missionType: record.missionType,
        faction: record.faction,
        minimumEnemyLevel: record.minimumEnemyLevel,
        maximumEnemyLevel: record.maximumEnemyLevel,
        evidence: evidence(page.revisionId, snapshot, record.name, record.line),
      };
    }

    const edges = new Set<string>();
    for (const record of records) {
      for (const neighbor of [...record.next, ...record.previous]) {
        if (!names.has(neighbor))
          throw new Error(
            `WARFRAME Wiki mission ${record.name} references missing node ${neighbor}`,
          );
        const pair = [record.name, neighbor].sort((left, right) =>
          left.localeCompare(right, "en"),
        );
        const edgeKey = JSON.stringify(pair);
        if (edges.has(edgeKey) || pair[0] === pair[1]) continue;
        edges.add(edgeKey);
        const relation: EntityRelationObservation = {
          type: "entity-relation",
          kind: "connects-to",
          fromExternalId: missionExternalId(pair[0]!),
          toExternalId: missionExternalId(pair[1]!),
          evidence: evidence(
            page.revisionId,
            snapshot,
            `${pair[0]}--${pair[1]}`,
            record.line,
          ),
        };
        yield relation;
      }
    }
    if (!edges.size)
      throw new Error(
        `WARFRAME Wiki ${MODULE_TITLE} has no mission connections`,
      );
  }
}

function parseMissionRecords(
  table: TableConstructorExpression,
): MissionRecord[] {
  return table.fields.flatMap((field) => {
    if (
      field.type !== "TableValue" ||
      field.value.type !== "TableConstructorExpression"
    )
      return [];
    const name = luaStringValue(luaLiteralField(field.value, "Name"))?.trim();
    if (!name) return [];
    const planet = luaStringValue(
      luaLiteralField(field.value, "Planet"),
    )?.trim();
    if (!planet) throw new Error(`WARFRAME Wiki mission ${name} has no Planet`);
    return [
      {
        name,
        planet,
        missionType: optionalString(field.value, "Type"),
        faction: optionalString(field.value, "Enemy"),
        minimumEnemyLevel: optionalInteger(field.value, "MinLevel"),
        maximumEnemyLevel: optionalInteger(field.value, "MaxLevel"),
        line: field.loc?.start.line,
        next: stringList(luaLiteralField(field.value, "NextNodes")),
        previous: stringList(luaLiteralField(field.value, "PreviousNodes")),
      },
    ];
  });
}

function optionalString(
  table: TableConstructorExpression,
  field: string,
): string | undefined {
  return luaStringValue(luaLiteralField(table, field))?.trim() || undefined;
}

function optionalInteger(
  table: TableConstructorExpression,
  field: string,
): number | undefined {
  const value = luaLiteralField(table, field);
  if (value === undefined) return undefined;
  if (value.type !== "NumericLiteral" || !Number.isSafeInteger(value.value))
    throw new Error(`WARFRAME Wiki mission ${field} is invalid`);
  return value.value;
}

function stringList(value: ReturnType<typeof luaLiteralField>): string[] {
  if (value === undefined) return [];
  if (value.type !== "TableConstructorExpression")
    throw new Error("WARFRAME Wiki mission connection list is invalid");
  return value.fields.flatMap((field) => {
    if (field.type !== "TableValue") return [];
    const item = luaStringValue(field.value)?.trim();
    return item ? [item] : [];
  });
}

function missionExternalId(name: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-missions",
    namespace: "mission-name",
    value: name,
  };
}

function evidence(
  revisionId: number,
  snapshot: Snapshot,
  recordKey: string,
  line?: number,
) {
  return {
    sourceId: "warframe-wiki-missions",
    sourceRecordKey: recordKey,
    snapshotVersion: snapshot.version,
    retrievedAt: snapshot.retrievedAt,
    citationUrl: wikiRevisionUrl(MODULE_TITLE, revisionId),
    license: "CC BY-NC-SA 3.0",
    path: line ? `${MODULE_TITLE}:${line}` : MODULE_TITLE,
  };
}
