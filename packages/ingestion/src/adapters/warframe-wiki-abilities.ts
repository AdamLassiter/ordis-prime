import type {
  EntityKind,
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

const PARSER_VERSION = "warframe-wiki-abilities-v3";
const ABILITY_MODULE = "Module:Ability/data";
const WARFRAME_MODULE = "Module:Warframes/data";
const MOD_MODULE = "Module:Mods/data";
const POWERSUIT_GROUPS = [
  { field: "Warframes", kind: "warframe", expectedType: "Warframe" },
  { field: "Archwings", kind: "archwing", expectedType: "Archwing" },
] as const satisfies ReadonlyArray<{
  field: string;
  kind: EntityKind;
  expectedType: string;
}>;

interface AbilityRecord {
  key: string;
  name: string;
  description?: string;
  powersuit: string;
  augments: string[];
  slot?: number;
  subsumable: boolean;
  line?: number;
}

interface AugmentRecord {
  key: string;
  name: string;
  description?: string;
  line?: number;
}

export class WarframeWikiAbilitiesAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "warframe-wiki-abilities",
    name: "WARFRAME Wiki ability data",
    homepage: "https://wiki.warframe.com/w/Module:Ability/data",
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
      moduleTitles: [ABILITY_MODULE, WARFRAME_MODULE, MOD_MODULE],
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const [abilityPage, warframePage, modPage] = readMediaWikiLuaPages(
      snapshot.bytes,
      [ABILITY_MODULE, WARFRAME_MODULE, MOD_MODULE],
    );
    const equipment = parsePowersuits(warframePage!.content);
    const equipmentAbilities = parsePowersuitAbilities(warframePage!.content);
    const root = parseLuaReturnTable(abilityPage!.content, abilityPage!.title);
    const abilityTable = luaLiteralField(root, "Ability");
    if (abilityTable?.type !== "TableConstructorExpression")
      throw new Error(`WARFRAME Wiki ${ABILITY_MODULE} has no Ability table`);
    const abilities = parseAbilities(abilityTable);
    if (!abilities.length)
      throw new Error(
        `WARFRAME Wiki ${ABILITY_MODULE} has no current abilities`,
      );
    const augments = parseAugments(modPage!.content);

    const linkedPowersuits = new Set([
      ...[...equipmentAbilities.keys()].filter((powersuit) =>
        equipment.has(powersuit),
      ),
      ...abilities
        .map(({ powersuit }) => powersuit)
        .filter((powersuit) => equipment.has(powersuit)),
    ]);
    for (const powersuit of linkedPowersuits) {
      const kind = equipment.get(powersuit)!;
      yield {
        type: "entity",
        kind,
        externalIds: [powersuitExternalId(powersuit)],
        fields: { name: powersuit, slug: wikiSlug(powersuit) },
        evidence: evidence(
          snapshot,
          warframePage!.title,
          warframePage!.revisionId,
          `powersuit:${powersuit}`,
        ),
      };
    }
    for (const ability of abilities) {
      const aliases = ability.key === ability.name ? undefined : [ability.key];
      yield {
        type: "entity",
        kind: "ability",
        externalIds: [abilityExternalId(ability.key)],
        aliases,
        fields: {
          name: ability.name,
          slug: wikiSlug(ability.name),
          description: ability.description,
        },
        evidence: evidence(
          snapshot,
          abilityPage!.title,
          abilityPage!.revisionId,
          `Ability:${ability.key}`,
          ability.line,
        ),
      };
      if (ability.slot !== undefined)
        yield {
          type: "entity-attribute",
          subjectExternalId: abilityExternalId(ability.key),
          key: "ability-slot",
          label: "Ability slot",
          value: String(ability.slot),
          evidence: evidence(
            snapshot,
            abilityPage!.title,
            abilityPage!.revisionId,
            `Ability:${ability.key}:slot`,
            ability.line,
          ),
        };
      yield {
        type: "entity-attribute",
        subjectExternalId: abilityExternalId(ability.key),
        key: "helminth-eligible",
        label: "Helminth eligible",
        value: ability.subsumable ? "true" : "false",
        evidence: evidence(
          snapshot,
          abilityPage!.title,
          abilityPage!.revisionId,
          `Ability:${ability.key}:helminth-eligible`,
          ability.line,
        ),
      };
      const owners = [...equipmentAbilities.entries()].filter(([, names]) =>
        names.includes(ability.name),
      );
      const typedOwners = owners.filter(([owner]) => equipment.has(owner));
      if (!typedOwners.length && equipment.has(ability.powersuit))
        typedOwners.push([ability.powersuit, [ability.name]]);
      for (const [owner] of typedOwners)
        yield {
          type: "entity-relation",
          kind: "involves",
          fromExternalId: powersuitExternalId(owner),
          toExternalId: abilityExternalId(ability.key),
          notes: `ability-slot:${equipmentAbilities.get(owner)?.indexOf(ability.name)! + 1 || ability.slot || 0}`,
          evidence: evidence(
            snapshot,
            warframePage!.title,
            warframePage!.revisionId,
            `${owner}:ability:${ability.key}`,
            ability.line,
          ),
        };
      for (const augmentName of ability.augments) {
        const augment = augments.get(augmentName) ?? {
          key: augmentName,
          name: augmentName,
        };
        const augmentEvidence = augments.has(augmentName)
          ? evidence(
              snapshot,
              modPage!.title,
              modPage!.revisionId,
              `Mods:${augment.key}`,
              augment.line,
            )
          : evidence(
              snapshot,
              abilityPage!.title,
              abilityPage!.revisionId,
              `Ability:${ability.key}:Augments:${augment.key}`,
              ability.line,
            );
        yield {
          type: "entity",
          kind: "mod",
          externalIds: [augmentExternalId(augment.key)],
          fields: {
            name: augment.name,
            slug: wikiSlug(augment.name),
            description: augment.description,
          },
          evidence: augmentEvidence,
        };
        yield {
          type: "entity-relation",
          kind: "augments",
          fromExternalId: augmentExternalId(augment.key),
          toExternalId: abilityExternalId(ability.key),
          evidence: evidence(
            snapshot,
            abilityPage!.title,
            abilityPage!.revisionId,
            `${ability.key}:augment:${augment.key}`,
            ability.line,
          ),
        };
      }
    }
  }
}

function parseAbilities(table: TableConstructorExpression): AbilityRecord[] {
  // Lua keeps the final value for a repeated table key. Mirror that behavior
  // without executing the module; the live Wiki currently contains one such
  // duplicate Drifter record.
  const records = new Map<string, AbilityRecord>();
  for (const field of table.fields) {
    if (field.type === "TableValue") continue;
    const key = luaFieldKey(field);
    if (!key || field.value.type !== "TableConstructorExpression") continue;
    const name =
      luaStringValue(luaLiteralField(field.value, "Name"))?.trim() || key;
    const powersuit = luaStringValue(
      luaLiteralField(field.value, "Powersuit"),
    )?.trim();
    if (!powersuit)
      throw new Error(`WARFRAME Wiki ability ${key} has no Powersuit`);
    const rawDescription = luaStringValue(
      luaLiteralField(field.value, "Description"),
    )?.trim();
    const augmentTable = luaLiteralField(field.value, "Augments");
    const augments =
      augmentTable?.type === "TableConstructorExpression"
        ? augmentTable.fields.flatMap((augmentField) => {
            if (augmentField.type !== "TableValue") return [];
            const value = luaStringValue(augmentField.value)?.trim();
            return value ? [value] : [];
          })
        : [];
    records.set(key, {
      key,
      name,
      powersuit,
      augments,
      slot:
        luaLiteralField(field.value, "Key")?.type === "NumericLiteral"
          ? (luaLiteralField(field.value, "Key") as { value: number }).value
          : undefined,
      subsumable:
        luaLiteralField(field.value, "Subsumable")?.type === "BooleanLiteral" &&
        (luaLiteralField(field.value, "Subsumable") as { value: boolean })
          .value,
      description: cleanDescription(rawDescription),
      line: field.loc?.start.line,
    });
  }
  return [...records.values()];
}

function parsePowersuitAbilities(source: string): Map<string, string[]> {
  const root = parseLuaReturnTable(source, WARFRAME_MODULE);
  const result = new Map<string, string[]>();
  for (const group of POWERSUIT_GROUPS) {
    const table = luaLiteralField(root, group.field);
    if (table?.type !== "TableConstructorExpression") continue;
    for (const field of table.fields) {
      if (
        field.type === "TableValue" ||
        field.value.type !== "TableConstructorExpression"
      )
        continue;
      const key = luaFieldKey(field);
      if (!key) continue;
      const name =
        luaStringValue(luaLiteralField(field.value, "Name"))?.trim() || key;
      const values = luaLiteralField(field.value, "Abilities");
      if (values?.type !== "TableConstructorExpression") continue;
      const abilities = values.fields.flatMap((abilityField) => {
        if (abilityField.type !== "TableValue") return [];
        const ability = luaStringValue(abilityField.value)?.trim();
        return ability ? [ability] : [];
      });
      if (abilities.length) result.set(name, abilities);
    }
  }
  return result;
}

function parseAugments(source: string): Map<string, AugmentRecord> {
  const root = parseLuaReturnTable(source, MOD_MODULE);
  const table = luaLiteralField(root, "Mods");
  if (table?.type !== "TableConstructorExpression")
    throw new Error(`WARFRAME Wiki ${MOD_MODULE} has no Mods table`);
  const result = new Map<string, AugmentRecord>();
  for (const field of table.fields) {
    if (
      field.type === "TableValue" ||
      field.value.type !== "TableConstructorExpression"
    )
      continue;
    const key = luaFieldKey(field);
    if (!key) continue;
    const isAugment = luaLiteralField(field.value, "IsAbilityAugment");
    if (isAugment?.type !== "BooleanLiteral" || !isAugment.value) continue;
    const name =
      luaStringValue(luaLiteralField(field.value, "Name"))?.trim() || key;
    result.set(name, {
      key,
      name,
      description: cleanDescription(
        luaStringValue(luaLiteralField(field.value, "Description"))?.trim(),
      ),
      line: field.loc?.start.line,
    });
  }
  return result;
}

function cleanDescription(value: string | undefined): string | undefined {
  return value
    ?.replace(/<[A-Z0-9_]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePowersuits(source: string): Map<string, EntityKind> {
  const root = parseLuaReturnTable(source, WARFRAME_MODULE);
  const result = new Map<string, EntityKind>();
  for (const group of POWERSUIT_GROUPS) {
    const table = luaLiteralField(root, group.field);
    if (table?.type !== "TableConstructorExpression")
      throw new Error(
        `WARFRAME Wiki ${WARFRAME_MODULE} has no ${group.field} table`,
      );
    for (const field of table.fields) {
      if (
        field.type === "TableValue" ||
        field.value.type !== "TableConstructorExpression"
      )
        continue;
      const ignored = luaLiteralField(field.value, "_IgnoreEntry");
      if (ignored?.type === "BooleanLiteral" && ignored.value) continue;
      const key = luaFieldKey(field);
      if (!key) continue;
      const type = luaStringValue(luaLiteralField(field.value, "Type"));
      if (type !== group.expectedType)
        throw new Error(
          `WARFRAME Wiki ${group.field} record ${key} has invalid Type`,
        );
      const name = luaStringValue(luaLiteralField(field.value, "Name"))?.trim();
      result.set(name || key, group.kind);
    }
  }
  return result;
}

function abilityExternalId(key: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-abilities",
    namespace: "ability-record",
    value: key,
  };
}

function powersuitExternalId(name: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-abilities",
    namespace: "powersuit-name",
    value: name,
  };
}

function augmentExternalId(key: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-abilities",
    namespace: "augment-record",
    value: key,
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
    sourceId: "warframe-wiki-abilities",
    sourceRecordKey,
    snapshotVersion: snapshot.version,
    retrievedAt: snapshot.retrievedAt,
    citationUrl: wikiRevisionUrl(title, revisionId),
    license: "CC BY-NC-SA 3.0",
    path: line ? `${title}:${line}` : title,
  };
}
