import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
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
export const DEFAULT_MEDIAWIKI_CACHE_MAX_AGE_MILLISECONDS =
  30 * 24 * 60 * 60_000;
const MEDIAWIKI_SNAPSHOT_FORMAT_VERSION = "mediawiki-pages-v2";

interface MediaWikiResponse {
  error?: { code?: string; info?: string };
  query?: { pages?: MediaWikiApiPage[] };
}

interface MediaWikiApiPage {
  title?: string;
  missing?: boolean;
  [key: string]: unknown;
  revisions?: Array<{
    revid?: number;
    slots?: {
      main?: {
        content?: string;
        contentmodel?: string;
        contentformat?: string;
      };
    };
  }>;
}

interface CachedMediaWikiPage {
  schemaVersion: 1;
  apiUrl: string;
  requestedTitle: string;
  fetchedAt: string;
  page: MediaWikiApiPage;
}

export interface LuaModulePage {
  title: string;
  revisionId: number;
  content: string;
}

export type MediaWikiRevisionPage = LuaModulePage;

export async function fetchMediaWikiPagesSnapshot(input: {
  apiUrl: string;
  pageTitles: readonly string[];
  sourceId: string;
  parserVersion: string;
  signal?: AbortSignal;
  cacheDirectory?: string;
  cacheMaxAgeMilliseconds?: number;
}): Promise<Snapshot> {
  if (input.cacheDirectory)
    return fetchCachedMediaWikiPagesSnapshot({
      ...input,
      cacheDirectory: input.cacheDirectory,
    });
  return fetchUncachedMediaWikiPagesSnapshot(input);
}

async function fetchUncachedMediaWikiPagesSnapshot(input: {
  apiUrl: string;
  pageTitles: readonly string[];
  sourceId: string;
  parserVersion: string;
  signal?: AbortSignal;
}): Promise<Snapshot> {
  const retrievedAt = new Date().toISOString();
  const bytes = await requestMediaWikiPages(input);
  return snapshotFromMediaWikiBytes(input, bytes, retrievedAt);
}

async function fetchCachedMediaWikiPagesSnapshot(input: {
  apiUrl: string;
  pageTitles: readonly string[];
  sourceId: string;
  parserVersion: string;
  signal?: AbortSignal;
  cacheDirectory: string;
  cacheMaxAgeMilliseconds?: number;
}): Promise<Snapshot> {
  const now = Date.now();
  const maxAge =
    input.cacheMaxAgeMilliseconds ??
    DEFAULT_MEDIAWIKI_CACHE_MAX_AGE_MILLISECONDS;
  if (!Number.isFinite(maxAge) || maxAge < 0)
    throw new Error("MediaWiki cache maximum age must be non-negative");
  const cached = new Map<string, CachedMediaWikiPage>();
  for (const title of input.pageTitles) {
    const entry = await readCachedPage(
      input.cacheDirectory,
      input.apiUrl,
      title,
    );
    if (entry) cached.set(title, entry);
  }
  const staleTitles = input.pageTitles.filter((title) => {
    const fetched = cached.get(title)?.fetchedAt;
    const fetchedAt = fetched ? Date.parse(fetched) : Number.NaN;
    return !Number.isFinite(fetchedAt) || now - fetchedAt > maxAge;
  });
  if (staleTitles.length) {
    try {
      const bytes = await requestMediaWikiPages({
        ...input,
        pageTitles: staleTitles,
      });
      const pages = readMediaWikiPages(bytes, staleTitles);
      const rawPages = mediaWikiPages(bytes);
      const fetchedAt = new Date(now).toISOString();
      for (const parsed of pages) {
        const page = rawPages.find(
          (candidate) => candidate.title === parsed.title,
        )!;
        const entry: CachedMediaWikiPage = {
          schemaVersion: 1,
          apiUrl: input.apiUrl,
          requestedTitle: parsed.title,
          fetchedAt,
          page,
        };
        await writeCachedPage(input.cacheDirectory, entry);
        cached.set(parsed.title, entry);
      }
    } catch (error) {
      const missing = staleTitles.filter((title) => !cached.has(title));
      if (missing.length) throw error;
      // A stale complete cache is preferable to losing offline processing.
    }
  }
  const entries = input.pageTitles.map((title) => cached.get(title)!);
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      batchcomplete: true,
      query: { pages: entries.map((entry) => entry.page) },
    }),
  );
  const retrievedAt = entries.map((entry) => entry.fetchedAt).sort()[0]!;
  return snapshotFromMediaWikiBytes(input, bytes, retrievedAt);
}

async function requestMediaWikiPages(input: {
  apiUrl: string;
  pageTitles: readonly string[];
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  const url = new URL(input.apiUrl);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "info|pageprops|revisions",
    inprop: "url|displaytitle",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    titles: input.pageTitles.join("|"),
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
  return new Uint8Array(await response.arrayBuffer());
}

function snapshotFromMediaWikiBytes(
  input: {
    pageTitles: readonly string[];
    sourceId: string;
    parserVersion: string;
  },
  bytes: Uint8Array,
  retrievedAt: string,
): Snapshot {
  const versions = readMediaWikiPages(bytes, input.pageTitles).map(
    (page) => `${page.title}@${page.revisionId}`,
  );
  return createSnapshot({
    sourceId: input.sourceId,
    version: `${versions.sort().join(",")}|${MEDIAWIKI_SNAPSHOT_FORMAT_VERSION}|${input.parserVersion}`,
    retrievedAt,
    mediaType: "application/json",
    bytes,
  });
}

export async function fetchMediaWikiLuaSnapshot(input: {
  apiUrl: string;
  moduleTitles: readonly string[];
  sourceId: string;
  parserVersion: string;
  signal?: AbortSignal;
  cacheDirectory?: string;
  cacheMaxAgeMilliseconds?: number;
}): Promise<Snapshot> {
  return fetchMediaWikiPagesSnapshot({
    ...input,
    pageTitles: input.moduleTitles,
  });
}

function mediaWikiPages(bytes: Uint8Array): MediaWikiApiPage[] {
  const payload = JSON.parse(
    new TextDecoder().decode(bytes),
  ) as MediaWikiResponse;
  if (!Array.isArray(payload.query?.pages))
    throw new Error("WARFRAME Wiki response has no pages");
  return payload.query.pages;
}

async function readCachedPage(
  directory: string,
  apiUrl: string,
  title: string,
): Promise<CachedMediaWikiPage | undefined> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(cachePath(directory, apiUrl, title), "utf8"),
    ) as CachedMediaWikiPage;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.apiUrl !== apiUrl ||
      parsed.requestedTitle !== title ||
      !parsed.fetchedAt ||
      parsed.page?.title !== title
    )
      throw new Error(`Invalid cached MediaWiki page ${title}`);
    // Validate the cached revision and content before trusting an offline copy.
    readMediaWikiPages(
      new TextEncoder().encode(
        JSON.stringify({ query: { pages: [parsed.page] } }),
      ),
      [title],
    );
    return parsed;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

async function writeCachedPage(
  directory: string,
  entry: CachedMediaWikiPage,
): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const destination = cachePath(directory, entry.apiUrl, entry.requestedTitle);
  const temporary = `${destination}.tmp-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(entry, null, 2)}\n`, {
      flag: "wx",
    });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

function cachePath(directory: string, apiUrl: string, title: string): string {
  const digest = createHash("sha256")
    .update(apiUrl)
    .update("\0")
    .update(title)
    .digest("hex");
  return path.join(directory, `${digest}.json`);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function readMediaWikiLuaPages(
  bytes: Uint8Array,
  requiredTitles: readonly string[],
): LuaModulePage[] {
  return readMediaWikiPages(bytes, requiredTitles);
}

export function readMediaWikiPages(
  bytes: Uint8Array,
  requiredTitles: readonly string[],
): MediaWikiRevisionPage[] {
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

export type LuaLiteral =
  | string
  | number
  | boolean
  | null
  | LuaLiteral[]
  | { [key: string]: LuaLiteral };

/** Reads data-only Lua values without evaluating module code. */
export function luaLiteralValue(
  expression: Expression | undefined,
): LuaLiteral | undefined {
  if (!expression) return undefined;
  if (expression.type === "StringLiteral") return luaStringValue(expression);
  if (
    expression.type === "NumericLiteral" ||
    expression.type === "BooleanLiteral"
  )
    return expression.value;
  if (expression.type === "NilLiteral") return null;
  if (
    expression.type === "UnaryExpression" &&
    expression.operator === "-" &&
    expression.argument.type === "NumericLiteral"
  )
    return -expression.argument.value;
  if (expression.type !== "TableConstructorExpression") return undefined;
  const array: LuaLiteral[] = [];
  const object: Record<string, LuaLiteral> = {};
  let objectLike = false;
  for (const field of expression.fields) {
    const value = luaLiteralValue(field.value);
    if (value === undefined) continue;
    if (field.type === "TableValue") {
      if (objectLike) object[String(array.length + 1)] = value;
      else array.push(value);
      continue;
    }
    objectLike = true;
    const key = luaFieldKey(field);
    if (key) object[key] = value;
    else if (field.key.type === "NumericLiteral")
      object[String(field.key.value)] = value;
  }
  if (!objectLike) return array;
  array.forEach((value, index) => {
    object[String(index + 1)] = value;
  });
  return object;
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
