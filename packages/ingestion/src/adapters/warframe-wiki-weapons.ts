import {
  parse,
  type Expression,
  type TableConstructorExpression,
  type TableKey,
  type TableKeyString,
} from "luaparse";
import {
  createSnapshot,
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";

export const DEFAULT_WARFRAME_WIKI_API_URL =
  "https://wiki.warframe.com/api.php";

const PARSER_VERSION = "warframe-wiki-weapons-v1";
const MODULE_TITLES = [
  "Module:Weapons/data/primary",
  "Module:Weapons/data/secondary",
  "Module:Weapons/data/melee",
  "Module:Weapons/data/archwing",
  "Module:Weapons/data/companion",
  "Module:Weapons/data/modular",
  "Module:Weapons/data/misc",
] as const;

interface MediaWikiResponse {
  error?: { code?: string; info?: string };
  query?: {
    pages?: MediaWikiPage[];
  };
}

interface MediaWikiPage {
  title?: string;
  missing?: boolean;
  revisions?: Array<{
    revid?: number;
    timestamp?: string;
    slots?: {
      main?: {
        content?: string;
      };
    };
  }>;
}

interface WikiWeaponRecord {
  key: string;
  name: string;
  link?: string;
  maxRank: number;
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
    const url = new URL(this.apiUrl);
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "revisions",
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      titles: MODULE_TITLES.join("|"),
    }).toString();
    const response = await fetch(url, {
      signal: context.signal,
      headers: {
        "User-Agent":
          "OrdisPrime/0.1 (+https://github.com/adamlassiter/ordis-prime)",
      },
    });
    if (!response.ok)
      throw new Error(`WARFRAME Wiki fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const payload = parsePayload(bytes);
    const versions = requiredPages(payload).map((page) => {
      const revision = page.revisions![0]!;
      return `${page.title}@${revision.revid}`;
    });
    return createSnapshot({
      sourceId: this.source.id,
      version: `${versions.sort().join(",")}|${PARSER_VERSION}`,
      retrievedAt: new Date().toISOString(),
      mediaType: "application/json",
      bytes,
    });
  }

  async *parse(snapshot: Snapshot) {
    const payload = parsePayload(snapshot.bytes);
    const seen = new Map<string, WikiWeaponRecord>();
    for (const page of requiredPages(payload)) {
      const title = page.title!;
      const revision = page.revisions![0]!;
      const content = revision.slots!.main!.content!;
      for (const record of parseWeaponModule(content, title)) {
        const identity = normalize(record.name);
        const prior = seen.get(identity);
        if (prior) {
          if (prior.maxRank !== record.maxRank)
            throw new Error(
              `WARFRAME Wiki weapon ${record.name} has conflicting maximum ranks`,
            );
          continue;
        }
        seen.set(identity, record);
        const modeLink =
          /\((?:Atmosphere|Primary|Secondary|Melee|Dual Swords|Heavy Blade)\)$/.test(
            record.name,
          )
            ? record.link
            : undefined;
        const aliases = [...new Set([record.key, modeLink])].filter(
          (value): value is string => Boolean(value && value !== record.name),
        );
        yield {
          type: "entity" as const,
          kind: "weapon" as const,
          externalIds: [
            {
              sourceId: this.source.id,
              namespace: "module-record",
              value: `${title}:${record.key}`,
            },
          ],
          aliases: aliases.length ? aliases : undefined,
          fields: {
            name: record.name,
            slug: slugify(record.name),
            equipmentMaxRank: record.maxRank,
          },
          evidence: {
            sourceId: this.source.id,
            sourceRecordKey: `${title}:${record.key}`,
            snapshotVersion: snapshot.version,
            retrievedAt: snapshot.retrievedAt,
            citationUrl: wikiRevisionUrl(title, revision.revid!),
            license: this.source.license,
            path: record.line ? `${title}:${record.line}` : title,
          },
        };
      }
    }
  }
}

function parsePayload(bytes: Uint8Array): MediaWikiResponse {
  let payload: MediaWikiResponse;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as MediaWikiResponse;
  } catch {
    throw new Error("WARFRAME Wiki response is not valid JSON");
  }
  if (payload.error)
    throw new Error(
      `WARFRAME Wiki API error ${payload.error.code ?? "unknown"}: ${payload.error.info ?? "No details"}`,
    );
  return payload;
}

function requiredPages(payload: MediaWikiResponse): MediaWikiPage[] {
  const pages = payload.query?.pages;
  if (!Array.isArray(pages))
    throw new Error("WARFRAME Wiki response has no pages");
  const byTitle = new Map(pages.map((page) => [page.title, page]));
  return MODULE_TITLES.map((title) => {
    const page = byTitle.get(title);
    const revision = page?.revisions?.[0];
    if (
      !page ||
      page.missing ||
      !Number.isSafeInteger(revision?.revid) ||
      typeof revision?.slots?.main?.content !== "string"
    )
      throw new Error(`WARFRAME Wiki response is missing ${title}`);
    return page;
  });
}

function parseWeaponModule(source: string, title: string): WikiWeaponRecord[] {
  let root: TableConstructorExpression;
  try {
    const chunk = parse(source, {
      luaVersion: "5.2",
      locations: true,
      encodingMode: "pseudo-latin1",
    });
    const returned = chunk.body.find(
      (statement) => statement.type === "ReturnStatement",
    );
    const expression = returned?.arguments[0];
    if (expression?.type !== "TableConstructorExpression")
      throw new Error("module does not return a table");
    root = expression;
  } catch (error) {
    throw new Error(
      `Cannot parse ${title}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const records: WikiWeaponRecord[] = [];
  for (const field of root.fields) {
    if (field.type === "TableValue") continue;
    const key = fieldKey(field);
    if (!key || field.value.type !== "TableConstructorExpression") continue;
    const ignored = literalField(field.value, "_IgnoreEntry");
    if (ignored?.type === "BooleanLiteral" && ignored.value) continue;
    const maxRank = literalField(field.value, "MaxRank");
    if (
      maxRank?.type !== "NumericLiteral" ||
      !Number.isSafeInteger(maxRank.value) ||
      maxRank.value < 30 ||
      maxRank.value > 40
    )
      continue;
    const nameField = literalField(field.value, "Name");
    const linkField = literalField(field.value, "Link");
    const name =
      nameField?.type === "StringLiteral" && nameField.value.trim()
        ? nameField.value.trim()
        : key;
    records.push({
      key,
      name,
      link:
        linkField?.type === "StringLiteral" && linkField.value.trim()
          ? linkField.value.trim()
          : undefined,
      maxRank: maxRank.value,
      line: field.loc?.start.line,
    });
  }
  return records;
}

function fieldKey(field: TableKey | TableKeyString): string | undefined {
  if (field.type === "TableKeyString") return field.key.name;
  if (field.key.type === "StringLiteral") return field.key.value;
  return undefined;
}

function literalField(
  table: TableConstructorExpression,
  name: string,
): Expression | undefined {
  return table.fields.find(
    (field): field is TableKey | TableKeyString =>
      field.type !== "TableValue" && fieldKey(field) === name,
  )?.value;
}

function wikiRevisionUrl(title: string, revisionId: number): string {
  return `https://wiki.warframe.com/w/${encodeURI(title.replaceAll(" ", "_"))}?oldid=${revisionId}`;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "");
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
