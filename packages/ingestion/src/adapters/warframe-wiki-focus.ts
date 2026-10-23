import type { Observation } from "@ordis-prime/domain";
import type { TableConstructorExpression } from "luaparse";
import type { FetchContext, Snapshot, SourceAdapter } from "../adapter.ts";
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

const MODULE_TITLE = "Module:Focus/data";
const PARSER_VERSION = "warframe-wiki-focus-v1";

export class WarframeWikiFocusAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.8;
  readonly source = {
    id: "warframe-wiki-focus",
    name: "WARFRAME Wiki Focus data",
    homepage: "https://wiki.warframe.com/w/Module:Focus/data",
    license: "CC BY-NC-SA 3.0",
    priority: 80,
  };

  private readonly apiUrl: string;

  constructor(apiUrl = DEFAULT_WARFRAME_WIKI_API_URL) {
    this.apiUrl = apiUrl;
  }

  fetch(context: FetchContext): Promise<Snapshot> {
    return fetchMediaWikiLuaSnapshot({
      apiUrl: this.apiUrl,
      moduleTitles: [MODULE_TITLE],
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const [page] = readMediaWikiLuaPages(snapshot.bytes, [MODULE_TITLE]);
    const root = parseLuaReturnTable(page!.content, page!.title);
    const schools = luaLiteralField(root, "Schools");
    if (schools?.type !== "TableConstructorExpression")
      throw new Error(`WARFRAME Wiki ${MODULE_TITLE} has no Schools table`);
    let count = 0;
    for (const field of schools.fields) {
      if (
        field.type === "TableValue" ||
        field.value.type !== "TableConstructorExpression"
      )
        continue;
      const key = luaFieldKey(field);
      if (!key) continue;
      const record = field.value as TableConstructorExpression;
      const name =
        luaStringValue(luaLiteralField(record, "Name"))?.trim() || key;
      const description = luaStringValue(
        luaLiteralField(record, "Description"),
      )?.trim();
      const internalName = luaStringValue(
        luaLiteralField(record, "InternalName"),
      )?.trim();
      count += 1;
      yield {
        type: "entity",
        kind: "focus-school",
        externalIds: [
          {
            sourceId: this.source.id,
            namespace: "focus-school",
            value: internalName || key,
          },
        ],
        fields: { name, slug: wikiSlug(name), description },
        evidence: {
          sourceId: this.source.id,
          sourceRecordKey: `Schools:${key}`,
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
          citationUrl: wikiRevisionUrl(page!.title, page!.revisionId),
          license: this.source.license,
        },
      };
    }
    if (count !== 5)
      throw new Error(
        `WARFRAME Wiki ${MODULE_TITLE} supplied ${count} schools`,
      );
  }
}
