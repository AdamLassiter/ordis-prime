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
  luaFieldKey,
  luaLiteralField,
  luaStringValue,
  parseLuaReturnTable,
  readMediaWikiLuaPages,
  wikiRevisionUrl,
  wikiSlug,
} from "./mediawiki-lua.ts";

const PARSER_VERSION = "warframe-wiki-missions-v4";
const MODULE_TITLE = "Module:Missions/data";
const QUEST_MODULE_TITLE = "Module:Keys/data";

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
  requirements?: string;
  masteryRequirement?: number;
}

interface QuestReference {
  name: string;
  link: string;
}

interface AccessReference {
  kind: "quest" | "node";
  name: string;
}

export class WarframeWikiMissionsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-missions",
    name: "WARFRAME Wiki mission data",
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
      moduleTitles: [MODULE_TITLE, QUEST_MODULE_TITLE],
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const pages = readMediaWikiLuaPages(snapshot.bytes, [
      MODULE_TITLE,
      QUEST_MODULE_TITLE,
    ]);
    const page = pages[0]!;
    const questPage = pages[1]!;
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
    const questReferences = parseQuestReferences(questPage.content);
    const accessRequirements = new Map(
      records.map((record) => [
        record.name,
        parseAccessRequirements(record.requirements, questReferences, names),
      ]),
    );
    const referencedQuests = new Map<string, QuestReference>();
    const questsByName = new Map(
      [...questReferences.values()].map((quest) => [quest.name, quest]),
    );
    for (const requirements of accessRequirements.values())
      for (const requirement of requirements) {
        if (requirement.kind !== "quest") continue;
        const quest = questsByName.get(requirement.name);
        if (quest) referencedQuests.set(quest.name, quest);
      }

    for (const record of records) {
      yield {
        type: "entity",
        kind: "node",
        externalIds: [missionExternalId(record.name)],
        fields: { name: record.name, slug: wikiSlug(record.name) },
        evidence: evidence(page.revisionId, snapshot, record.name, record.line),
      };
    }
    for (const quest of referencedQuests.values()) {
      yield {
        type: "entity",
        kind: "quest",
        externalIds: [missionQuestExternalId(quest.name)],
        fields: { name: quest.name, slug: wikiSlug(quest.name) },
        evidence: evidence(
          questPage.revisionId,
          snapshot,
          `quest:${quest.name}`,
        ),
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
        masteryRequirement: record.masteryRequirement,
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

    for (const record of records) {
      for (const requirement of accessRequirements.get(record.name) ?? []) {
        yield {
          type: "entity-relation",
          kind: "requires",
          fromExternalId: missionExternalId(record.name),
          toExternalId:
            requirement.kind === "quest"
              ? missionQuestExternalId(requirement.name)
              : missionExternalId(requirement.name),
          evidence: evidence(
            page.revisionId,
            snapshot,
            `${record.name}:Requirements:${requirement.kind}:${requirement.name}`,
            record.line,
          ),
        };
      }
    }
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
        requirements: optionalString(field.value, "Requirements"),
        masteryRequirement: parseMasteryRequirement(
          optionalString(field.value, "Requirements"),
        ),
      },
    ];
  });
}

function parseMasteryRequirement(
  requirements: string | undefined,
): number | undefined {
  const match = requirements?.match(
    /^Must be \[\[Mastery Rank\]\] (\d+) or higher to access$/,
  );
  if (!match) return undefined;
  const rank = Number(match[1]);
  if (!Number.isSafeInteger(rank) || rank < 0 || rank > 30)
    throw new Error(
      "WARFRAME Wiki mission Mastery Rank requirement is invalid",
    );
  return rank;
}

function parseQuestReferences(source: string): Map<string, QuestReference> {
  const root = parseLuaReturnTable(source, QUEST_MODULE_TITLE);
  const result = new Map<string, QuestReference>();
  for (const field of root.fields) {
    if (field.type === "TableValue") continue;
    const key = luaFieldKey(field);
    if (!key || field.value.type !== "TableConstructorExpression") continue;
    const type = optionalString(field.value, "Type");
    if (!type?.endsWith("Quest")) continue;
    const name = optionalString(field.value, "Name");
    if (!name) throw new Error(`WARFRAME Wiki quest ${key} has no Name`);
    const quest = {
      name,
      link: optionalString(field.value, "Link") ?? name,
    };
    for (const label of new Set([key, name, quest.link])) {
      if (result.has(label))
        throw new Error(`WARFRAME Wiki quest reference ${label} is duplicated`);
      result.set(label, quest);
    }
  }
  if (!result.size)
    throw new Error(`WARFRAME Wiki ${QUEST_MODULE_TITLE} has no quests`);
  return result;
}

function parseAccessRequirements(
  requirements: string | undefined,
  quests: Map<string, QuestReference>,
  nodes: Set<string>,
): AccessReference[] {
  if (!requirements) return [];
  const links = [...requirements.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  if (!links.length) return [];
  const resolved = links.map((match) => {
    const label = match[1]!.trim();
    const quest = quests.get(label);
    const node = nodes.has(label) ? label : undefined;
    if (Boolean(quest) === Boolean(node)) return undefined;
    return quest
      ? ({ kind: "quest", name: quest.name } as const)
      : ({ kind: "node", name: node! } as const);
  });
  if (resolved.some((reference) => reference === undefined)) return [];
  let linkIndex = 0;
  const shape = requirements
    .replace(/\[\[[^\]]+\]\]/g, () => {
      const reference = resolved[linkIndex++]!;
      return `[[${reference.kind.toUpperCase()}]]`;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (
    !new Set([
      "Must have [[QUEST]] completed to access",
      "Must complete [[QUEST]] to access",
      "Must have [[QUEST]] completed",
      "Must have [[QUEST]] and [[QUEST]] completed to access",
      "Must have [[NODE]] completed",
      "Must have [[NODE]] completed to access",
      "Must complete [[NODE]] to access",
      "Must have [[QUEST]] completed to access Must have [[NODE]] completed",
    ]).has(shape)
  )
    return [];
  return [
    ...new Map(
      resolved.map((reference) => [
        `${reference!.kind}:${reference!.name}`,
        reference!,
      ]),
    ).values(),
  ];
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

function missionQuestExternalId(name: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-missions",
    namespace: "quest-name",
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
