import { createHash } from "node:crypto";
import type { ExternalIdentifier, Observation } from "@ordis-prime/domain";
import {
  type FetchContext,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";
import {
  DEFAULT_WARFRAME_WIKI_API_URL,
  fetchMediaWikiPagesSnapshot,
  readMediaWikiPages,
  wikiRevisionUrl,
  wikiSlug,
} from "./mediawiki-lua.ts";

const PARSER_VERSION = "warframe-wiki-junctions-v1";
const JUNCTION_TITLES = [
  "Venus Junction",
  "Mercury Junction",
  "Mars Junction",
  "Phobos Junction",
  "Ceres Junction",
  "Jupiter Junction",
  "Europa Junction",
  "Saturn Junction",
  "Uranus Junction",
  "Neptune Junction",
  "Pluto Junction",
  "Eris Junction",
  "Sedna Junction",
] as const;

interface JunctionObjective {
  key: string;
  label: string;
  hint?: string;
  sortOrder: number;
}

export class WarframeWikiJunctionsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.75;
  readonly source = {
    id: "warframe-wiki-junctions",
    name: "WARFRAME Wiki Junction tasks",
    homepage: "https://wiki.warframe.com/w/Junction",
    license: "CC BY-NC-SA 3.0",
    priority: 80,
  };
  private readonly apiUrl: string;

  constructor(apiUrl = DEFAULT_WARFRAME_WIKI_API_URL) {
    this.apiUrl = apiUrl;
  }

  async fetch(context: FetchContext): Promise<Snapshot> {
    return fetchMediaWikiPagesSnapshot({
      apiUrl: this.apiUrl,
      pageTitles: JUNCTION_TITLES,
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const pages = readMediaWikiPages(snapshot.bytes, JUNCTION_TITLES);
    for (const page of pages) {
      const objectives = parseJunctionObjectives(page.content, page.title);
      const nodeExternalId = junctionExternalId(page.title);
      yield {
        type: "entity",
        kind: "node",
        externalIds: [nodeExternalId],
        fields: { name: page.title, slug: wikiSlug(page.title) },
        evidence: {
          sourceId: this.source.id,
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
          license: "CC BY-NC-SA 3.0",
          sourceRecordKey: `page:${page.title}`,
          citationUrl: wikiRevisionUrl(page.title, page.revisionId),
          path: page.title,
        },
      };
      for (const objective of objectives) {
        yield {
          type: "node-objective",
          nodeExternalId,
          key: objective.key,
          label: objective.label,
          hint: objective.hint,
          sortOrder: objective.sortOrder,
          evidence: {
            sourceId: this.source.id,
            snapshotVersion: snapshot.version,
            retrievedAt: snapshot.retrievedAt,
            license: "CC BY-NC-SA 3.0",
            sourceRecordKey: `${page.title}:task:${objective.key}`,
            citationUrl: wikiRevisionUrl(page.title, page.revisionId),
            path: `${page.title} > Junction Tasks > ${objective.sortOrder + 1}`,
          },
        };
      }
    }
  }
}

function parseJunctionObjectives(
  source: string,
  title: string,
): JunctionObjective[] {
  const section = source.match(
    /==\s*Junction Tasks\s*==\s*([\s\S]*?)(?=\n==[^=])/,
  )?.[1];
  if (!section)
    throw new Error(`WARFRAME Wiki ${title} has no Junction Tasks section`);
  const table = section.match(/\{\|[\s\S]*?\n\|\}/)?.[0];
  if (!table)
    throw new Error(`WARFRAME Wiki ${title} has no Junction Tasks table`);
  const objectives: JunctionObjective[] = [];
  for (const row of table.split(/^\|-\s*$/m)) {
    const cells = [...row.matchAll(/^\|(?![}|-])\s*(.*)$/gm)].map(
      (match) => match[1] ?? "",
    );
    if (!cells.length || cells[0]!.includes("rowspan=")) continue;
    const label = plainWikiText(cells[0]!);
    if (!label || label === "Complete the Junction") continue;
    const hint = plainWikiText(cells[1] ?? "") || undefined;
    const key = objectiveKey(label);
    if (objectives.some((objective) => objective.key === key))
      throw new Error(
        `WARFRAME Wiki ${title} has duplicate Junction task ${label}`,
      );
    objectives.push({ key, label, hint, sortOrder: objectives.length });
  }
  if (objectives.length !== 4)
    throw new Error(
      `WARFRAME Wiki ${title} has ${objectives.length} Junction tasks; expected 4`,
    );
  return objectives;
}

function plainWikiText(value: string): string {
  let result = value;
  for (;;) {
    const expanded = result.replace(/\{\{([^{}]+)\}\}/g, (_match, body) => {
      const fields = String(body)
        .split("|")
        .slice(1)
        .map((field) => field.trim())
        .filter((field) => field && !field.includes("="));
      return fields[0] ?? "";
    });
    if (expanded === result) break;
    result = expanded;
  }
  return result
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]#]+)(?:#[^\]]+)?\]\]/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/'{2,}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function objectiveKey(label: string): string {
  return createHash("sha256")
    .update(label.normalize("NFKC").toLocaleLowerCase("en"))
    .digest("hex")
    .slice(0, 16);
}

function junctionExternalId(title: string): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-junctions",
    namespace: "page-title",
    value: title,
  };
}
