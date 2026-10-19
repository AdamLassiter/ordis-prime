import type { ExternalIdentifier, Observation } from "@ordis-prime/domain";
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

const PARSER_VERSION = "warframe-wiki-quests-v1";
const MODULE_TITLE = "Module:Keys/data";

interface QuestRecord {
  key: string;
  name: string;
  description?: string;
  previousQuest?: string;
  line?: number;
}

export class WarframeWikiQuestsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-quests",
    name: "WARFRAME Wiki quest data",
    homepage: "https://wiki.warframe.com/w/Module:Keys/data",
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
    const records = parseQuests(page.content);
    const byName = new Map(records.map((record) => [record.name, record]));
    for (const record of records) {
      if (!record.previousQuest) continue;
      if (record.previousQuest === record.name)
        throw new Error(`WARFRAME Wiki quest ${record.key} follows itself`);
      if (!byName.has(record.previousQuest))
        throw new Error(
          `WARFRAME Wiki quest ${record.key} has unknown PreviousQuest ${record.previousQuest}`,
        );
    }
    rejectSequenceCycles(records, byName);

    for (const record of records) {
      yield {
        type: "entity",
        kind: "quest",
        externalIds: [questExternalId(record.key)],
        aliases: record.key === record.name ? undefined : [record.key],
        fields: {
          name: record.name,
          slug: wikiSlug(record.name),
          description: record.description,
        },
        evidence: evidence(snapshot, page.revisionId, record.key, record.line),
      };
    }
    for (const record of records) {
      if (!record.previousQuest) continue;
      const previous = byName.get(record.previousQuest)!;
      yield {
        type: "entity-relation",
        kind: "follows",
        fromExternalId: questExternalId(record.key),
        toExternalId: questExternalId(previous.key),
        evidence: evidence(
          snapshot,
          page.revisionId,
          `${record.key}:PreviousQuest`,
          record.line,
        ),
      };
    }
  }
}

function rejectSequenceCycles(
  records: QuestRecord[],
  byName: Map<string, QuestRecord>,
): void {
  for (const origin of records) {
    const path = new Set<string>();
    let current: QuestRecord | undefined = origin;
    while (current?.previousQuest) {
      if (path.has(current.name))
        throw new Error(
          `WARFRAME Wiki quest sequence contains a cycle at ${current.name}`,
        );
      path.add(current.name);
      current = byName.get(current.previousQuest);
    }
  }
}

function parseQuests(source: string): QuestRecord[] {
  const root = parseLuaReturnTable(source, MODULE_TITLE);
  const records: QuestRecord[] = [];
  const names = new Set<string>();
  for (const field of root.fields) {
    if (field.type === "TableValue") continue;
    const key = luaFieldKey(field);
    if (!key || field.value.type !== "TableConstructorExpression") continue;
    const type = luaStringValue(luaLiteralField(field.value, "Type"))?.trim();
    if (!type?.endsWith("Quest")) continue;
    const name = luaStringValue(luaLiteralField(field.value, "Name"))?.trim();
    if (!name) throw new Error(`WARFRAME Wiki quest ${key} has no Name`);
    if (names.has(name))
      throw new Error(`WARFRAME Wiki quest name ${name} is duplicated`);
    names.add(name);
    const description = cleanText(
      luaStringValue(luaLiteralField(field.value, "Description")),
    );
    const previousQuest = luaStringValue(
      luaLiteralField(field.value, "PreviousQuest"),
    )?.trim();
    records.push({
      key,
      name,
      description: description || undefined,
      previousQuest: previousQuest || undefined,
      line: field.loc?.start.line,
    });
  }
  if (!records.length)
    throw new Error(`WARFRAME Wiki ${MODULE_TITLE} has no quests`);
  return records;
}

function cleanText(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, " ").trim();
}

function questExternalId(key: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-quests",
    namespace: "quest-record",
    value: key,
  };
}

function evidence(
  snapshot: Snapshot,
  revisionId: number,
  sourceRecordKey: string,
  line?: number,
) {
  return {
    sourceId: "warframe-wiki-quests",
    sourceRecordKey,
    snapshotVersion: snapshot.version,
    retrievedAt: snapshot.retrievedAt,
    citationUrl: wikiRevisionUrl(MODULE_TITLE, revisionId),
    license: "CC BY-NC-SA 3.0",
    path: line ? `${MODULE_TITLE}:${line}` : MODULE_TITLE,
  };
}
