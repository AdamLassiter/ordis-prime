import type {
  CyclicRewardChoiceObservation,
  CyclicRewardScheduleObservation,
  Observation,
} from "@ordis-prime/domain";
import type { FetchContext, Snapshot, SourceAdapter } from "../adapter.ts";
import {
  DEFAULT_WARFRAME_WIKI_API_URL,
  fetchMediaWikiPagesSnapshot,
  readMediaWikiPages,
  wikiRevisionUrl,
} from "./mediawiki-lua.ts";

const PAGE = "The Circuit";
const PARSER_VERSION = "warframe-wiki-circuit-v1";
const WEEK_SECONDS = 604_800;

export class WarframeWikiCircuitAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.8;
  readonly source = {
    id: "warframe-wiki-circuit",
    name: "WARFRAME Wiki Circuit reward rotations",
    homepage: "https://wiki.warframe.com/w/The_Circuit",
    license: "CC BY-NC-SA 3.0",
    priority: 80,
  };
  private readonly apiUrl: string;

  constructor(apiUrl = DEFAULT_WARFRAME_WIKI_API_URL) {
    this.apiUrl = apiUrl;
  }

  fetch(context: FetchContext): Promise<Snapshot> {
    return fetchMediaWikiPagesSnapshot({
      apiUrl: this.apiUrl,
      pageTitles: [PAGE],
      sourceId: this.source.id,
      parserVersion: PARSER_VERSION,
      signal: context.signal,
      cacheDirectory: context.cacheDirectory,
      cacheMaxAgeMilliseconds: context.cacheMaxAgeMilliseconds,
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const [page] = readMediaWikiPages(snapshot.bytes, [PAGE]);
    const evidence = (record: string, line: number) => ({
      sourceId: this.source.id,
      sourceRecordKey: record,
      snapshotVersion: snapshot.version,
      retrievedAt: snapshot.retrievedAt,
      citationUrl: wikiRevisionUrl(page!.title, page!.revisionId),
      license: this.source.license,
      path: `${page!.title}:${line}`,
    });
    const normal = parseNormalSchedule(page!.content, evidence);
    const steel = parseSteelSchedule(page!.content, evidence);
    yield normal.schedule;
    yield* normal.choices;
    yield steel.schedule;
    yield* steel.choices;
  }
}

type EvidenceFactory = (
  record: string,
  line: number,
) => CyclicRewardScheduleObservation["evidence"];

function parseNormalSchedule(source: string, evidence: EvidenceFactory) {
  const section = between(
    source,
    "<caption>Normal Circuit Warframe Rotation</caption>",
    "</table>",
  );
  const epoch = parseEpoch(source, "RotatingRewardsIndexNormal");
  const rows = [
    ...section.matchAll(
      /<tr\s+\{\{#ifeq:[\s\S]*?\|\s*(\d+)\s*\|[^}]+\}\}>\s*<th>Week\s+(\d+)<\/th>([\s\S]*?)<\/tr>/g,
    ),
  ];
  const choices: CyclicRewardChoiceObservation[] = [];
  for (const row of rows) {
    const phaseIndex = Number(row[1]);
    const week = Number(row[2]);
    const pairs = [
      ...(row[3] ?? "").matchAll(
        /\{\{WF\|([^}|]+)(?:\|[^}]*)?\}\}[\s\S]*?\{\{M\|([^}|]+)(?:\|[^}]*)?\}\}/g,
      ),
    ];
    for (const [position, pair] of pairs.entries()) {
      const warframe = pair[1]!.trim();
      const augment = pair[2]!.trim();
      choices.push({
        type: "cyclic-reward-choice",
        scheduleKey: "circuit-normal",
        phaseIndex,
        phaseLabel: `Week ${week}`,
        position,
        primary: { label: warframe },
        acquisitionMode: "path",
        includedRewards: [{ label: augment, tier: 7 }],
        evidence: evidence(
          `normal:week-${week}:${position + 1}`,
          lineAt(source, row.index!),
        ),
      });
    }
  }
  if (rows.length !== 11 || choices.length !== 33)
    throw new Error(
      `WARFRAME Wiki ${PAGE} normal rotation expected 11x3 choices, found ${rows.length}x${choices.length / Math.max(rows.length, 1)}`,
    );
  return {
    schedule: {
      type: "cyclic-reward-schedule",
      key: "circuit-normal",
      label: "Normal Circuit Warframe Rotation",
      epoch,
      intervalSeconds: WEEK_SECONDS,
      phaseCount: 11,
      choicesPerPhase: 3,
      selectionsAllowed: 1,
      instructions:
        "Choose one Warframe reward path. Its component blueprints appear at tiers 2, 5, 8, and 10; the listed augment is included at tier 7.",
      evidence: evidence(
        "normal:schedule",
        lineAt(source, source.indexOf(section)),
      ),
    } satisfies CyclicRewardScheduleObservation,
    choices,
  };
}

function parseSteelSchedule(source: string, evidence: EvidenceFactory) {
  const marker = "The Steel Path Incarnon Genesis Reward Rotation";
  const section = between(source, marker, "! Week 10+");
  const epoch = parseEpoch(source, "RotatingRewardsIndexHard");
  const rows = [
    ...section.matchAll(
      /!\s*\{\{#ifeq:[\s\S]*?\|\s*(\d+)\s*\|[^}]+\}\}\s*\|Week\s+(\d+)\s+\(([A-I])\)[\s\S]*?\n\|[^\n]*\|\n([\s\S]*?)(?=\n\|-)/g,
    ),
  ];
  const choices: CyclicRewardChoiceObservation[] = [];
  for (const row of rows) {
    const phaseIndex = Number(row[1]);
    const week = Number(row[2]);
    const rotation = row[3]!;
    const rewards = [
      ...(row[4] ?? "").matchAll(
        /^\*\s*\{\{Resource\|([^}|]+)(?:\|[^}]*)?\}\}/gm,
      ),
    ];
    for (const [position, reward] of rewards.entries()) {
      choices.push({
        type: "cyclic-reward-choice",
        scheduleKey: "circuit-steel-path",
        phaseIndex,
        phaseLabel: `Week ${week} (${rotation})`,
        position,
        primary: { label: reward[1]!.trim() },
        acquisitionMode: "item",
        evidence: evidence(
          `steel-path:week-${week}:${position + 1}`,
          lineAt(source, source.indexOf(section) + row.index!),
        ),
      });
    }
  }
  if (rows.length !== 9 || choices.length !== 45)
    throw new Error(
      `WARFRAME Wiki ${PAGE} Steel Path rotation expected 9x5 choices, found ${rows.length}x${choices.length / Math.max(rows.length, 1)}`,
    );
  return {
    schedule: {
      type: "cyclic-reward-schedule",
      key: "circuit-steel-path",
      label: "Steel Path Circuit Incarnon Rotation",
      epoch,
      intervalSeconds: WEEK_SECONDS,
      phaseCount: 9,
      choicesPerPhase: 5,
      selectionsAllowed: 2,
      instructions:
        "Choose two of the five Incarnon Genesis adapters; they are awarded at tiers 5 and 10.",
      evidence: evidence(
        "steel-path:schedule",
        lineAt(source, source.indexOf(marker)),
      ),
    } satisfies CyclicRewardScheduleObservation,
    choices,
  };
}

function parseEpoch(source: string, variable: string): string {
  const match = source.match(
    new RegExp(
      `#vardefine:${variable}[\\s\\S]*?\\{\\{#time:\\s*U\\s*\\|\\s*(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:\\s+00:00:00)?\\s*\\}\\}`,
    ),
  );
  if (!match) throw new Error(`WARFRAME Wiki ${PAGE} has no ${variable} epoch`);
  return `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}T00:00:00.000Z`;
}

function between(
  source: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0)
    throw new Error(`WARFRAME Wiki ${PAGE} is missing ${startMarker}`);
  return source.slice(start, end);
}

function lineAt(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}
