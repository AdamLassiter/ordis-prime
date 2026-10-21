import { createHash } from "node:crypto";
import type {
  EntityKind,
  ExternalIdentifier,
  Observation,
} from "@ordis-prime/domain";
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

const PARSER_VERSION = "warframe-wiki-junctions-v3";
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

interface RewardTarget {
  kind: EntityKind;
  name: string;
}

interface JunctionReward {
  key: string;
  label: string;
  quantity?: number;
  trigger: "objective" | "junction-completion";
  objectiveKey?: string;
  sortOrder: number;
  target?: RewardTarget;
}

interface ParsedJunction {
  objectives: JunctionObjective[];
  rewards: JunctionReward[];
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
    const pages = readMediaWikiPages(snapshot.bytes, JUNCTION_TITLES).map(
      (page) => ({ ...page, parsed: parseJunction(page.content, page.title) }),
    );
    const emittedTargets = new Set<string>();
    for (const page of pages) {
      const nodeExternalId = junctionExternalId(page.title);
      yield {
        type: "entity",
        kind: "node",
        externalIds: [nodeExternalId],
        fields: { name: page.title, slug: wikiSlug(page.title) },
        evidence: evidence(page, snapshot, `page:${page.title}`, page.title),
      };
      for (const objective of page.parsed.objectives) {
        yield {
          type: "node-objective",
          nodeExternalId,
          key: objective.key,
          label: objective.label,
          hint: objective.hint,
          sortOrder: objective.sortOrder,
          evidence: evidence(
            page,
            snapshot,
            `${page.title}:task:${objective.key}`,
            `${page.title} > Junction Tasks > ${objective.sortOrder + 1}`,
          ),
        };
      }
      for (const reward of page.parsed.rewards) {
        const rewardExternalId = reward.target
          ? rewardTargetExternalId(reward.target)
          : undefined;
        if (
          reward.target &&
          !emittedTargets.has(externalIdentity(reward.target))
        ) {
          emittedTargets.add(externalIdentity(reward.target));
          yield {
            type: "entity",
            kind: reward.target.kind,
            externalIds: [rewardExternalId!],
            fields: {
              name: reward.target.name,
              slug: wikiSlug(reward.target.name),
            },
            evidence: evidence(
              page,
              snapshot,
              `reward-entity:${reward.target.kind}:${reward.target.name}`,
              `${page.title} > Junction Tasks > Rewards`,
            ),
          };
        }
        yield {
          type: "node-reward",
          nodeExternalId,
          rewardExternalId,
          key: reward.key,
          label: reward.label,
          quantity: reward.quantity,
          trigger: reward.trigger,
          objectiveKey: reward.objectiveKey,
          sortOrder: reward.sortOrder,
          evidence: evidence(
            page,
            snapshot,
            `${page.title}:reward:${reward.key}`,
            `${page.title} > Junction Tasks > Rewards > ${reward.sortOrder + 1}`,
          ),
        };
      }
    }
  }
}

function parseJunction(source: string, title: string): ParsedJunction {
  const section = source.match(
    /==\s*Junction Tasks\s*==\s*([\s\S]*?)(?=\n==[^=])/,
  )?.[1];
  if (!section)
    throw new Error(`WARFRAME Wiki ${title} has no Junction Tasks section`);
  const table = section.match(/\{\|[\s\S]*?\n\|\}/)?.[0];
  if (!table)
    throw new Error(`WARFRAME Wiki ${title} has no Junction Tasks table`);
  const objectives: JunctionObjective[] = [];
  const rewards: JunctionReward[] = [];
  for (const row of table.split(/^\|-\s*$/m)) {
    const cells = tableCells(row);
    if (!cells.length || cells[0]!.includes("rowspan=")) continue;
    const label = plainWikiText(cells[0]!);
    if (!label) continue;
    const completion = label === "Complete the Junction";
    const objectiveKey = completion ? undefined : contentKey(label);
    if (!completion) {
      if (objectives.some((objective) => objective.key === objectiveKey))
        throw new Error(
          `WARFRAME Wiki ${title} has duplicate Junction task ${label}`,
        );
      objectives.push({
        key: objectiveKey!,
        label,
        hint: plainWikiText(cells[1] ?? "") || undefined,
        sortOrder: objectives.length,
      });
    }
    for (const parsed of parseRewardCell(cells[2] ?? "")) {
      const trigger = completion ? "junction-completion" : "objective";
      const key = rewardKey(trigger, objectiveKey, parsed.label, parsed.target);
      if (rewards.some((reward) => reward.key === key))
        throw new Error(
          `WARFRAME Wiki ${title} has duplicate Junction reward ${parsed.label}`,
        );
      rewards.push({
        ...parsed,
        key,
        trigger,
        objectiveKey,
        sortOrder: rewards.length,
      });
    }
  }
  if (objectives.length !== 4)
    throw new Error(
      `WARFRAME Wiki ${title} has ${objectives.length} Junction tasks; expected 4`,
    );
  if (rewards.length < 6)
    throw new Error(
      `WARFRAME Wiki ${title} has ${rewards.length} Junction rewards; expected at least 6`,
    );
  return { objectives, rewards };
}

function tableCells(row: string): string[] {
  const cells: string[] = [];
  for (const line of row.split("\n")) {
    if (/^\|(?![}|-])/.test(line)) {
      cells.push(line.replace(/^\|\s?/, ""));
      continue;
    }
    if (cells.length && line.trim()) cells[cells.length - 1] += `\n${line}`;
  }
  return cells;
}

function parseRewardCell(
  source: string,
): Array<Pick<JunctionReward, "label" | "quantity" | "target">> {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("*"))
    .flatMap((line) => parseRewardLine(line.replace(/^\*\s*/, "")));
}

function parseRewardLine(
  source: string,
): Array<Pick<JunctionReward, "label" | "quantity" | "target">> {
  if (/^Quests?:/i.test(source)) {
    const quests = wikiLinks(source);
    if (!quests.length) return [{ label: plainWikiText(source) }];
    return quests.map(({ display }) => ({
      label: `Quest: ${display}`,
      quantity: 1,
      target: { kind: "quest", name: display },
    }));
  }

  const currency = source.match(/\{\{Cc\|([\d,]+)\}\}/i);
  if (currency) {
    return [
      {
        label: `${currency[1]} Credits`,
        quantity: numericQuantity(currency[1]!),
        target: { kind: "resource", name: "Credits" },
      },
    ];
  }

  const template = source.match(
    /\{\{(M|Resource|Weapon|WF|Companion|Gear)\|([^}|]+)(?:\|([^}]+))?\}\}/i,
  );
  if (template) {
    const templateName = template[1]!.toLocaleLowerCase("en");
    const linkName = template[2]!.trim();
    const displayName = (template[3] ?? linkName).trim();
    const suffix = source.slice((template.index ?? 0) + template[0].length);
    let target: RewardTarget | undefined;
    if (templateName === "m") target = { kind: "mod", name: linkName };
    else if (templateName === "resource")
      target = { kind: "resource", name: linkName };
    else if (templateName === "weapon")
      target = { kind: "weapon", name: displayName };
    else if (templateName === "companion")
      target = { kind: "companion", name: linkName };
    else if (templateName === "wf") {
      const component = suffix.match(/\b(Chassis|Systems|Neuroptics)\b/i)?.[1];
      target =
        component?.toLocaleLowerCase("en") === "neuroptics" &&
        linkName.toLocaleLowerCase("en") === "chroma"
          ? undefined
          : component
            ? { kind: "component", name: `${linkName} ${component}` }
            : { kind: "warframe", name: linkName };
    } else {
      target = /\bBlueprint\b/i.test(suffix)
        ? { kind: "component", name: `${linkName} Blueprint` }
        : { kind: "unknown", name: linkName };
    }
    return [
      {
        label: plainWikiText(source),
        quantity: leadingQuantity(source) ?? 1,
        target,
      },
    ];
  }

  const links = wikiLinks(source);
  if (links.length === 1) {
    const display = links[0]!.display;
    const label = plainWikiText(source);
    const unlock = /^Unlock\s+/i.test(source);
    const segment = /\bSegment\b/i.test(display);
    const relic = !segment && /\bRelic\b/i.test(source);
    const blueprint = /\bBlueprint\b/i.test(source);
    const pack = /\bPack\b/i.test(source);
    return [
      {
        label,
        quantity: leadingQuantity(source) ?? 1,
        target: {
          kind: unlock
            ? "mechanic"
            : segment
              ? "mechanic"
              : relic
                ? "relic"
                : blueprint
                  ? "component"
                  : "unknown",
          name: segment
            ? display
            : relic
              ? `${display} Relic`
              : blueprint
                ? `${display} Blueprint`
                : pack
                  ? `${display} Pack`
                  : display,
        },
      },
    ];
  }
  return [{ label: plainWikiText(source) }];
}

function wikiLinks(source: string): Array<{ target: string; display: string }> {
  return [
    ...source.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g),
  ].map((match) => ({
    target: match[1]!.trim(),
    display: (match[2] ?? match[1])!.trim(),
  }));
}

function leadingQuantity(source: string): number | undefined {
  const value = source.match(/^([\d,]+)\s+/)?.[1];
  return value ? numericQuantity(value) : undefined;
}

function numericQuantity(value: string): number {
  const quantity = Number(value.replaceAll(",", ""));
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    throw new Error(
      `WARFRAME Wiki Junction reward quantity is invalid: ${value}`,
    );
  return quantity;
}

function plainWikiText(value: string): string {
  let result = value;
  for (;;) {
    const expanded = result.replace(/\{\{([^{}]+)\}\}/g, (_match, body) => {
      const [template, ...rawFields] = String(body).split("|");
      const fields = rawFields
        .map((field) => field.trim())
        .filter((field) => field && !field.includes("="));
      const displayed = fields.at(-1) ?? "";
      return template?.trim().toLocaleLowerCase("en") === "cc" &&
        /^\d/.test(displayed)
        ? `${displayed} Credits`
        : displayed;
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

function rewardKey(
  trigger: JunctionReward["trigger"],
  objectiveKey: string | undefined,
  label: string,
  target: RewardTarget | undefined,
): string {
  return contentKey(
    [trigger, objectiveKey ?? "completion", label, target?.kind, target?.name]
      .filter(Boolean)
      .join("\u0000"),
  );
}

function contentKey(value: string): string {
  return createHash("sha256")
    .update(value.normalize("NFKC").toLocaleLowerCase("en"))
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

function rewardTargetExternalId(target: RewardTarget): ExternalIdentifier {
  return {
    sourceId: "warframe-wiki-junctions",
    namespace: `reward-${target.kind}`,
    value: target.name,
  };
}

function externalIdentity(target: RewardTarget): string {
  return `${target.kind}\u0000${target.name}`;
}

function evidence(
  page: { title: string; revisionId: number },
  snapshot: Snapshot,
  sourceRecordKey: string,
  path: string,
) {
  return {
    sourceId: "warframe-wiki-junctions",
    snapshotVersion: snapshot.version,
    retrievedAt: snapshot.retrievedAt,
    license: "CC BY-NC-SA 3.0",
    sourceRecordKey,
    citationUrl: wikiRevisionUrl(page.title, page.revisionId),
    path,
  };
}
