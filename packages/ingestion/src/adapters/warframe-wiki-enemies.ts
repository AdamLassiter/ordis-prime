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

const PARSER_VERSION = "warframe-wiki-enemies-v3";
const INDEX_MODULE = "Module:Enemies/data";
const PARTITIONS = [
  "grineer",
  "corpus",
  "infestation",
  "orokin",
  "sentient",
  "stalker",
  "narmer",
  "themurmur",
  "scaldra",
  "techrot",
  "anarchs",
  "unaffiliated",
] as const;
const PARTITION_MODULES = PARTITIONS.map(
  (partition) => `${INDEX_MODULE}/${partition}`,
);
const MODULE_TITLES = [INDEX_MODULE, ...PARTITION_MODULES];
type EnemyPartition = (typeof PARTITIONS)[number];

interface BossRecord {
  partition: EnemyPartition;
  key: string;
  name: string;
  description?: string;
  line?: number;
}

export class WarframeWikiEnemiesAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-enemies",
    name: "WARFRAME Wiki enemy data",
    homepage: "https://wiki.warframe.com/w/Module:Enemies/data",
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
      moduleTitles: MODULE_TITLES,
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const pages = readMediaWikiLuaPages(snapshot.bytes, MODULE_TITLES);
    assertSupportedPartitions(pages[0]!.content);
    const bosses = pages
      .slice(1)
      .flatMap((page, index) =>
        parseBosses(page.content, PARTITIONS[index]!, page.title),
      );
    if (!bosses.length)
      throw new Error(`WARFRAME Wiki ${INDEX_MODULE} has no bosses`);
    const nameCounts = new Map<string, number>();
    for (const boss of bosses) {
      nameCounts.set(boss.name, (nameCounts.get(boss.name) ?? 0) + 1);
    }
    const resolvedNames = new Set<string>();
    for (const boss of bosses) {
      const name = resolvedBossName(boss, nameCounts);
      if (resolvedNames.has(name))
        throw new Error(
          `WARFRAME Wiki enemy boss name ${name} cannot be disambiguated`,
        );
      resolvedNames.add(name);
    }

    for (const boss of bosses) {
      const page = pages[PARTITIONS.indexOf(boss.partition) + 1]!;
      const name = resolvedBossName(boss, nameCounts);
      yield {
        type: "entity",
        kind: "boss",
        externalIds: [bossExternalId(boss.partition, boss.key)],
        aliases: boss.key === name ? undefined : [boss.key],
        fields: {
          name,
          slug: wikiSlug(name),
          description: boss.description,
        },
        evidence: {
          sourceId: this.source.id,
          sourceRecordKey: `${boss.partition}:${boss.key}`,
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
          citationUrl: wikiRevisionUrl(page.title, page.revisionId),
          license: this.source.license,
          path: boss.line ? `${page.title}:${boss.line}` : page.title,
        },
      };
    }
  }
}

function resolvedBossName(
  boss: BossRecord,
  nameCounts: ReadonlyMap<string, number>,
): string {
  return (nameCounts.get(boss.name) ?? 0) > 1 ? boss.key : boss.name;
}

function assertSupportedPartitions(source: string): void {
  const declaration = source.match(
    /local\s+COOP_FACTIONS\s*=\s*\{([\s\S]*?)\}/,
  )?.[1];
  if (!declaration)
    throw new Error(`WARFRAME Wiki ${INDEX_MODULE} has no faction list`);
  const upstream = [...declaration.matchAll(/["']([a-z0-9]+)["']/gi)].map(
    (match) => match[1]!,
  );
  if (!upstream.length)
    throw new Error(`WARFRAME Wiki ${INDEX_MODULE} has an empty faction list`);
  const unsupported = upstream.filter(
    (partition) => !(PARTITIONS as readonly string[]).includes(partition),
  );
  const missing = PARTITIONS.filter(
    (partition) => !upstream.includes(partition),
  );
  if (unsupported.length || missing.length)
    throw new Error(
      `WARFRAME Wiki enemy partitions changed (unsupported: ${unsupported.join(", ") || "none"}; missing: ${missing.join(", ") || "none"})`,
    );
}

function parseBosses(
  source: string,
  partition: EnemyPartition,
  title: string,
): BossRecord[] {
  const root = parseLuaReturnTable(source, title);
  const records: BossRecord[] = [];
  for (const field of root.fields) {
    if (field.type === "TableValue") continue;
    const key = luaFieldKey(field);
    if (!key || field.value.type !== "TableConstructorExpression") continue;
    const ignored = luaLiteralField(field.value, "_IgnoreEntry");
    if (ignored?.type === "BooleanLiteral" && ignored.value) continue;
    const general = luaLiteralField(field.value, "General");
    if (general?.type !== "TableConstructorExpression") continue;
    if (luaStringValue(luaLiteralField(general, "Type"))?.trim() !== "Boss")
      continue;
    const name =
      luaStringValue(luaLiteralField(general, "Name"))?.trim() || key;
    const description = cleanDescription(
      luaStringValue(luaLiteralField(general, "Description")),
    );
    records.push({
      partition,
      key,
      name,
      description: description || undefined,
      line: field.loc?.start.line,
    });
  }
  return records;
}

function cleanDescription(value: string | undefined): string | undefined {
  return value
    ?.replace(/<[A-Z0-9_]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bossExternalId(partition: string, key: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-enemies",
    namespace: "enemy-record",
    value: `${partition}:${key}`,
  };
}
