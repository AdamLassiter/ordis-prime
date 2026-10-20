import {
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";
import {
  fetchMediaWikiLuaSnapshot,
  DEFAULT_WARFRAME_WIKI_API_URL,
  luaFieldKey,
  luaLiteralField,
  luaStringValue,
  parseLuaReturnTable,
  readMediaWikiLuaPages,
  wikiNormalizedName,
  wikiRevisionUrl,
  wikiSlug,
} from "./mediawiki-lua.ts";
import {
  parseEquipmentPolarities,
  type ParsedEquipmentPolarity,
} from "./wiki-equipment-polarities.ts";

export { DEFAULT_WARFRAME_WIKI_API_URL } from "./mediawiki-lua.ts";

const PARSER_VERSION = "warframe-wiki-weapons-v4";
const MODULE_TITLES = [
  "Module:Weapons/data/primary",
  "Module:Weapons/data/secondary",
  "Module:Weapons/data/melee",
  "Module:Weapons/data/archwing",
  "Module:Weapons/data/companion",
  "Module:Weapons/data/modular",
  "Module:Weapons/data/misc",
] as const;

interface WikiWeaponRecord {
  key: string;
  name: string;
  link?: string;
  maxRank: number;
  configuration?: string;
  factoryPolarities: ParsedEquipmentPolarity[];
  line?: number;
}

export class WarframeWikiWeaponsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-weapons",
    name: "WARFRAME Wiki weapon data",
    homepage: "https://wiki.warframe.com/w/Module:Weapons/data",
    license: "CC BY-NC-SA 3.0",
    // WFCD remains authoritative for shared identity fields. This source adds
    // structured fields that its aggregate does not currently expose.
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

  async *parse(snapshot: Snapshot) {
    const seen = new Map<string, WikiWeaponRecord>();
    for (const page of readMediaWikiLuaPages(snapshot.bytes, MODULE_TITLES)) {
      for (const record of parseWeaponModule(page.content, page.title)) {
        const identity = wikiNormalizedName(record.name);
        const prior = seen.get(identity);
        if (prior) {
          if (
            prior.maxRank !== record.maxRank ||
            JSON.stringify(prior.factoryPolarities) !==
              JSON.stringify(record.factoryPolarities)
          )
            throw new Error(
              `WARFRAME Wiki weapon ${record.name} has conflicting equipment facts`,
            );
          continue;
        }
        seen.set(identity, record);
        const modeLink = record.configuration ? record.link : undefined;
        const aliases = [...new Set([record.key, modeLink])].filter(
          (value): value is string => Boolean(value && value !== record.name),
        );
        const externalId = {
          sourceId: this.source.id,
          namespace: "module-record",
          value: `${page.title}:${record.key}`,
        };
        const recordKey = `${page.title}:${record.key}`;
        const recordEvidence = {
          sourceId: this.source.id,
          sourceRecordKey: recordKey,
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
          citationUrl: wikiRevisionUrl(page.title, page.revisionId),
          license: this.source.license,
          path: record.line ? `${page.title}:${record.line}` : page.title,
        };
        yield {
          type: "entity" as const,
          kind: "weapon" as const,
          externalIds: [externalId],
          aliases: aliases.length ? aliases : undefined,
          fields: {
            name: record.name,
            slug: wikiSlug(record.name),
            equipmentMaxRank: record.maxRank,
          },
          evidence: recordEvidence,
        };
        yield {
          type: "equipment-polarity-set" as const,
          subjectExternalId: externalId,
          ...(record.configuration
            ? { configuration: record.configuration }
            : {}),
          polarities: record.factoryPolarities,
          evidence: {
            ...recordEvidence,
            sourceRecordKey: `${recordKey}:factory-polarities`,
          },
        };
      }
    }
  }
}

function parseWeaponModule(source: string, title: string): WikiWeaponRecord[] {
  const root = parseLuaReturnTable(source, title);

  const records: WikiWeaponRecord[] = [];
  for (const field of root.fields) {
    if (field.type === "TableValue") continue;
    const key = luaFieldKey(field);
    if (!key || field.value.type !== "TableConstructorExpression") continue;
    const ignored = luaLiteralField(field.value, "_IgnoreEntry");
    if (ignored?.type === "BooleanLiteral" && ignored.value) continue;
    const maxRank = luaLiteralField(field.value, "MaxRank");
    if (
      maxRank?.type !== "NumericLiteral" ||
      !Number.isSafeInteger(maxRank.value) ||
      maxRank.value < 30 ||
      maxRank.value > 40
    )
      continue;
    const nameField = luaLiteralField(field.value, "Name");
    const linkField = luaLiteralField(field.value, "Link");
    const parsedName = luaStringValue(nameField)?.trim();
    const parsedLink = luaStringValue(linkField)?.trim();
    const name = parsedName || key;
    const configuration = name.match(
      /\((Atmosphere|Primary|Secondary|Melee|Dual Swords|Heavy Blade)\)$/,
    )?.[1];
    records.push({
      key,
      name,
      link: parsedLink || undefined,
      maxRank: maxRank.value,
      configuration,
      factoryPolarities: parseEquipmentPolarities(
        field.value,
        `WARFRAME Wiki weapon ${name}`,
        [
          { field: "StancePolarity", role: "stance" },
          { field: "ExilusPolarity", role: "exilus" },
        ],
      ),
      line: field.loc?.start.line,
    });
  }
  return records;
}
