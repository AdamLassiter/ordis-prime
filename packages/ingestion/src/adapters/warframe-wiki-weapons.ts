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
  luaLiteralValue,
  type LuaLiteral,
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

const PARSER_VERSION = "warframe-wiki-weapons-v5";
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
  attributes: WikiWeaponAttribute[];
  line?: number;
}

interface WikiWeaponAttribute {
  key: string;
  label: string;
  value: string;
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
      cacheDirectory: context.cacheDirectory,
      cacheMaxAgeMilliseconds: context.cacheMaxAgeMilliseconds,
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
              JSON.stringify(record.factoryPolarities) ||
            JSON.stringify(prior.attributes) !==
              JSON.stringify(record.attributes)
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
        for (const attribute of record.attributes) {
          const scopedKey = record.configuration
            ? `${wikiSlug(record.configuration)}-${attribute.key}`
            : attribute.key;
          yield {
            type: "entity-attribute" as const,
            subjectExternalId: externalId,
            key: scopedKey,
            label: record.configuration
              ? `${record.configuration} — ${attribute.label}`
              : attribute.label,
            value: attribute.value,
            evidence: {
              ...recordEvidence,
              sourceRecordKey: `${recordKey}:${scopedKey}`,
            },
          };
        }
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
      attributes: weaponAttributes(field.value),
      line: field.loc?.start.line,
    });
  }
  return records;
}

const OMITTED_WEAPON_FIELDS = new Set([
  "Attacks",
  "DefaultUpgrades",
  "ExilusPolarity",
  "Image",
  "InternalName",
  "Link",
  "MaxRank",
  "Name",
  "Polarities",
  "StancePolarity",
]);

function weaponAttributes(
  record: Parameters<typeof luaLiteralField>[0],
): WikiWeaponAttribute[] {
  const attributes: WikiWeaponAttribute[] = [];
  for (const field of record.fields) {
    if (field.type === "TableValue") continue;
    const name = luaFieldKey(field);
    if (!name || name.startsWith("_") || OMITTED_WEAPON_FIELDS.has(name))
      continue;
    const value = luaLiteralValue(field.value);
    if (value !== undefined)
      flattenWeaponValue(attributes, [name], [humanizeWikiField(name)], value);
  }
  const attacks = luaLiteralValue(luaLiteralField(record, "Attacks"));
  if (Array.isArray(attacks))
    attacks.forEach((attack, index) => {
      if (!isLiteralObject(attack)) return;
      const attackNumber = index + 1;
      const attackName =
        typeof attack.AttackName === "string"
          ? attack.AttackName
          : `Attack ${attackNumber}`;
      for (const [name, value] of Object.entries(attack)) {
        if (name === "AttackName" || name === "AttackIndex") continue;
        flattenWeaponValue(
          attributes,
          [`attack-${attackNumber}`, name],
          [attackName, humanizeWikiField(name)],
          value,
        );
      }
      if (isLiteralObject(attack.Damage)) {
        const total = Object.values(attack.Damage).reduce<number>(
          (sum, value) => sum + (typeof value === "number" ? value : 0),
          0,
        );
        if (total > 0)
          attributes.push({
            key: `attack-${attackNumber}-total-damage`,
            label: `${attackName} — Total damage`,
            value: formatNumber(total),
          });
      }
    });
  return attributes.sort((left, right) => left.key.localeCompare(right.key));
}

function flattenWeaponValue(
  output: WikiWeaponAttribute[],
  keyParts: string[],
  labelParts: string[],
  value: LuaLiteral,
): void {
  if (value === null) return;
  if (Array.isArray(value)) {
    const scalars = value.filter(isScalarLiteral);
    if (scalars.length === value.length && value.length)
      output.push({
        key: weaponAttributeKey(keyParts),
        label: labelParts.join(" — "),
        value: scalars
          .map((entry) => formatWeaponValue(keyParts.at(-1)!, entry))
          .join(", "),
      });
    else
      value.forEach((entry, index) =>
        flattenWeaponValue(
          output,
          [...keyParts, String(index + 1)],
          [...labelParts, String(index + 1)],
          entry,
        ),
      );
    return;
  }
  if (isLiteralObject(value)) {
    for (const [name, nested] of Object.entries(value))
      flattenWeaponValue(
        output,
        [...keyParts, name],
        [...labelParts, humanizeWikiField(name)],
        nested,
      );
    return;
  }
  output.push({
    key: weaponAttributeKey(keyParts),
    label: labelParts.join(" — "),
    value: formatWeaponValue(keyParts.at(-1)!, value),
  });
}

function isLiteralObject(
  value: LuaLiteral | undefined,
): value is Record<string, LuaLiteral> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalarLiteral(
  value: LuaLiteral,
): value is string | number | boolean {
  return value !== null && typeof value !== "object";
}

function formatWeaponValue(field: string, value: string | number | boolean) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (/Chance$|Reduction$/.test(field))
      return `${formatNumber(value * 100)}%`;
    return formatNumber(value);
  }
  return value;
}

function weaponAttributeKey(parts: string[]): string {
  return wikiSlug(
    parts
      .map((part) =>
        part
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .replace(/([A-Za-z])([0-9])/g, "$1-$2"),
      )
      .join("-"),
  );
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 6,
  });
}

function humanizeWikiField(value: string): string {
  const known: Record<string, string> = {
    AmmoMax: "Maximum ammo",
    AmmoPickup: "Ammo pickup",
    CritChance: "Critical chance",
    CritMultiplier: "Critical multiplier",
    IsSilent: "Silent",
    Mastery: "Mastery requirement",
    Multishot: "Multishot",
    PunchThrough: "Punch through",
    SellPrice: "Sell price",
    ShotSpeed: "Projectile speed",
    ShotType: "Shot type",
    StatusChance: "Status chance",
  };
  return (
    known[value] ??
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (character) => character.toUpperCase())
  );
}
