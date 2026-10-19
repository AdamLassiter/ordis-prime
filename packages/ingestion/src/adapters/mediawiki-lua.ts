import { Buffer } from "node:buffer";
import {
  parse,
  type Expression,
  type TableConstructorExpression,
  type TableKey,
  type TableKeyString,
} from "luaparse";
import { createSnapshot, type Snapshot } from "../adapter.ts";

export const DEFAULT_WARFRAME_WIKI_API_URL =
  "https://wiki.warframe.com/api.php";

interface MediaWikiResponse {
  error?: { code?: string; info?: string };
  query?: { pages?: MediaWikiPage[] };
}

interface MediaWikiPage {
  title?: string;
  missing?: boolean;
  revisions?: Array<{
    revid?: number;
    slots?: { main?: { content?: string } };
  }>;
}

export interface LuaModulePage {
  title: string;
  revisionId: number;
  content: string;
}

export async function fetchMediaWikiLuaSnapshot(input: {
  apiUrl: string;
  moduleTitles: readonly string[];
  sourceId: string;
  parserVersion: string;
  signal?: AbortSignal;
}): Promise<Snapshot> {
  const url = new URL(input.apiUrl);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "revisions",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    titles: input.moduleTitles.join("|"),
  }).toString();
  const response = await fetch(url, {
    signal: input.signal,
    headers: {
      "User-Agent":
        "OrdisPrime/0.1 (+https://github.com/adamlassiter/ordis-prime)",
    },
  });
  if (!response.ok)
    throw new Error(`WARFRAME Wiki fetch failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const versions = readMediaWikiLuaPages(bytes, input.moduleTitles).map(
    (page) => `${page.title}@${page.revisionId}`,
  );
  return createSnapshot({
    sourceId: input.sourceId,
    version: `${versions.sort().join(",")}|${input.parserVersion}`,
    retrievedAt: new Date().toISOString(),
    mediaType: "application/json",
    bytes,
  });
}

export function readMediaWikiLuaPages(
  bytes: Uint8Array,
  requiredTitles: readonly string[],
): LuaModulePage[] {
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
  if (!Array.isArray(payload.query?.pages))
    throw new Error("WARFRAME Wiki response has no pages");
  const byTitle = new Map(
    payload.query.pages.map((page) => [page.title, page]),
  );
  return requiredTitles.map((title) => {
    const page = byTitle.get(title);
    const revision = page?.revisions?.[0];
    const revisionId = revision?.revid;
    const content = revision?.slots?.main?.content;
    if (
      !page ||
      page.missing ||
      !Number.isSafeInteger(revisionId) ||
      typeof content !== "string"
    )
      throw new Error(`WARFRAME Wiki response is missing ${title}`);
    return { title, revisionId: revisionId!, content };
  });
}

export function parseLuaReturnTable(
  source: string,
  title: string,
): TableConstructorExpression {
  try {
    const byteString = Buffer.from(source, "utf8").toString("latin1");
    const chunk = parse(byteString, {
      luaVersion: "5.2",
      locations: true,
      encodingMode: "pseudo-latin1",
    });
    const returned = chunk.body.find(
      (statement) => statement.type === "ReturnStatement",
    );
    const expression = returned?.arguments[0];
    if (expression?.type === "TableConstructorExpression") return expression;
    if (expression?.type === "Identifier") {
      for (const statement of chunk.body) {
        if (statement.type !== "LocalStatement") continue;
        const index = statement.variables.findIndex(
          (variable) =>
            variable.type === "Identifier" && variable.name === expression.name,
        );
        const value = statement.init[index];
        if (value?.type === "TableConstructorExpression") return value;
      }
    }
    throw new Error("module does not return a table");
  } catch (error) {
    throw new Error(
      `Cannot parse ${title}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function luaFieldKey(
  field: TableKey | TableKeyString,
): string | undefined {
  if (field.type === "TableKeyString") return field.key.name;
  if (field.key.type === "StringLiteral") return luaStringValue(field.key);
  return undefined;
}

export function luaStringValue(
  expression: Expression | undefined,
): string | undefined {
  if (expression?.type !== "StringLiteral") return undefined;
  return Buffer.from(expression.value, "latin1").toString("utf8");
}

export function luaLiteralField(
  table: TableConstructorExpression,
  name: string,
): Expression | undefined {
  return table.fields.find(
    (field): field is TableKey | TableKeyString =>
      field.type !== "TableValue" && luaFieldKey(field) === name,
  )?.value;
}

export function wikiRevisionUrl(title: string, revisionId: number): string {
  return `https://wiki.warframe.com/w/${encodeURI(title.replaceAll(" ", "_"))}?oldid=${revisionId}`;
}

export function wikiNormalizedName(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "");
}

export function wikiSlug(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
