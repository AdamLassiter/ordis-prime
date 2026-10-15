import type { WorldStateWindowObservation } from "@ordis-prime/domain";
import { beginSourceRefresh, completeSourceRefresh, failSourceRefresh, promoteWorldState } from "@ordis-prime/db";
import { createSnapshot, type FetchContext, type Snapshot, type SourceDescriptor } from "./adapter.ts";
import { SnapshotStore } from "./snapshot-store.ts";

type WorldStateDatabase = Parameters<typeof promoteWorldState>[0];

export interface WorldStateAdapter {
  readonly source: SourceDescriptor;
  fetch(context: FetchContext): Promise<Snapshot>;
  parse(snapshot: Snapshot): WorldStateWindowObservation[];
}

export class WfcdWorldStateAdapter implements WorldStateAdapter {
  readonly source = { id: "wfcd-worldstate", name: "WFCD WarframeStat.us world state", homepage: "https://github.com/WFCD/warframe-status", license: "MIT", priority: 100 };
  private readonly url: string;
  constructor(url = "https://api.warframestat.us/pc?language=en") { this.url = url; }

  async fetch(context: FetchContext): Promise<Snapshot> {
    const response = await fetch(this.url, { signal: context.signal, headers: { "User-Agent": "OrdisPrime/0.1 (+https://github.com/adamlassiter/ordis-prime)" } });
    if (!response.ok) throw new Error(`WFCD world-state fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const payload = parseObject(bytes);
    const timestamp = stringValue(payload.timestamp);
    if (!timestamp || !Number.isFinite(Date.parse(timestamp))) throw new Error("WFCD world state has no valid timestamp");
    return createSnapshot({ sourceId: this.source.id, version: timestamp, retrievedAt: new Date().toISOString(), mediaType: "application/json", bytes });
  }

  parse(snapshot: Snapshot): WorldStateWindowObservation[] {
    const payload = parseObject(snapshot.bytes);
    const windows: WorldStateWindowObservation[] = [];
    const evidence = (recordKey: string, path: string) => ({ sourceId: this.source.id, sourceRecordKey: recordKey, snapshotVersion: snapshot.version, retrievedAt: snapshot.retrievedAt, path });
    for (const [key, label] of [["earthCycle", "Earth"], ["cetusCycle", "Cetus"], ["vallisCycle", "Orb Vallis"], ["cambionCycle", "Cambion Drift"], ["zarimanCycle", "Zariman"], ["duviriCycle", "Duviri"]] as const) {
      const cycle = recordValue(payload[key]);
      if (!cycle) continue;
      const id = stringValue(cycle.id);
      const state = stringValue(cycle.state);
      if (!id || !state) continue;
      windows.push({ externalId: `cycle:${id}`, kind: "cycle", label, state, activation: dateValue(cycle.activation), expiry: dateValue(cycle.expiry), evidence: evidence(id, key) });
    }
    for (const [index, eventValue] of arrayValue(payload.events).entries()) {
      const event = recordValue(eventValue); if (!event) continue;
      const id = stringValue(event.id); const description = stringValue(event.description); if (!id || !description) continue;
      const subjects = uniqueSubjects([
        { label: description },
        ...arrayValue(event.rewards).flatMap(rewardSubjects),
        ...arrayValue(event.interimSteps).flatMap((step) => rewardSubjects(recordValue(step)?.reward)),
      ]);
      windows.push({ externalId: `event:${id}`, kind: "event", label: description, nodeLabel: stringValue(event.node), subjects, activation: dateValue(event.activation), expiry: dateValue(event.expiry), metadata: primitiveMetadata({ tooltip: event.tooltip, health: event.health, maximumScore: event.maximumScore }), evidence: evidence(id, `events[${index}]`) });
    }
    for (const [index, alertValue] of arrayValue(payload.alerts).entries()) {
      const alert = recordValue(alertValue); const mission = recordValue(alert?.mission); if (!alert || !mission) continue;
      const id = stringValue(alert.id); if (!id) continue;
      const reward = recordValue(mission.reward);
      const rewards = [...new Set([...arrayValue(reward?.items), ...arrayValue(reward?.countedItems).map((item) => stringValue(recordValue(item)?.type))].filter((item): item is string => typeof item === "string"))];
      const node = stringValue(mission.node);
      windows.push({ externalId: `alert:${id}`, kind: "alert", label: rewards.length ? `Alert: ${rewards.join(", ")}` : "Alert", nodeLabel: node, subjects: rewardSubjects(reward), activation: dateValue(alert.activation), expiry: dateValue(alert.expiry), metadata: primitiveMetadata({ missionType: mission.type, faction: mission.faction }), evidence: evidence(id, `alerts[${index}]`) });
    }
    for (const [index, fissureValue] of arrayValue(payload.fissures).entries()) {
      const fissure = recordValue(fissureValue); if (!fissure) continue;
      const id = stringValue(fissure.id); const tier = stringValue(fissure.tier); if (!id || !tier) continue;
      const missionType = stringValue(fissure.missionType);
      windows.push({ externalId: `fissure:${id}`, kind: "fissure", label: `${tier} Fissure${missionType ? ` · ${missionType}` : ""}`, nodeLabel: stringValue(fissure.node), activation: dateValue(fissure.activation), expiry: dateValue(fissure.expiry), metadata: primitiveMetadata({ tierNum: fissure.tierNum, enemy: fissure.enemy, isStorm: fissure.isStorm, isHard: fissure.isHard }), evidence: evidence(id, `fissures[${index}]`) });
    }
    const traders = arrayValue(payload.voidTraders).length ? arrayValue(payload.voidTraders) : [payload.voidTrader];
    for (const [index, traderValue] of traders.entries()) {
      const trader = recordValue(traderValue); if (!trader) continue;
      const id = stringValue(trader.id); const location = stringValue(trader.location); if (!id || !location) continue;
      const subjects = uniqueSubjects(arrayValue(trader.inventory).flatMap((entry) => {
        const item = recordValue(entry);
        const label = stringValue(item?.item) ?? stringValue(item?.type);
        const uniqueName = stringValue(item?.uniqueName);
        return label ? [{ label, ...(uniqueName ? { externalIds: [wfcdItemId(uniqueName)] } : {}) }] : [];
      }));
      windows.push({ externalId: `trader:${id}`, kind: "trader", label: "Void Trader", nodeLabel: location, subjects, activation: dateValue(trader.activation), expiry: dateValue(trader.expiry), metadata: primitiveMetadata({ character: trader.character }), evidence: evidence(id, `voidTraders[${index}]`) });
    }
    if (!windows.length) throw new Error("WFCD world state produced no availability windows");
    return windows;
  }
}

export async function refreshWorldState(options: { adapter: WorldStateAdapter; database: WorldStateDatabase; snapshotStore: SnapshotStore; signal?: AbortSignal }) {
  const refreshId = beginSourceRefresh(options.database, options.adapter.source);
  let snapshotPath: string | undefined;
  try {
    const snapshot = await options.adapter.fetch({ signal: options.signal });
    snapshotPath = await options.snapshotStore.put(snapshot);
    const windows = options.adapter.parse(snapshot);
    const result = promoteWorldState(options.database, { source: options.adapter.source, version: snapshot.version, contentHash: snapshot.contentHash, observedAt: snapshot.version, snapshotPath, windows });
    completeSourceRefresh(options.database, refreshId, { worldStateSnapshotId: result.snapshotId, snapshotPath, recordsProcessed: windows.length });
    return { ...result, snapshotPath };
  } catch (error) {
    failSourceRefresh(options.database, refreshId, error, snapshotPath);
    throw error;
  }
}

function parseObject(bytes: Uint8Array): Record<string, unknown> {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const result = recordValue(parsed);
  if (!result) throw new Error("WFCD world-state payload must be an object");
  return result;
}
function recordValue(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function dateValue(value: unknown): string | undefined { const text = stringValue(value); return text && Number.isFinite(Date.parse(text)) ? text : undefined; }
function primitiveMetadata(values: Record<string, unknown>): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string | number | boolean | null] => entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])));
}

function rewardSubjects(value: unknown): NonNullable<WorldStateWindowObservation["subjects"]> {
  const reward = recordValue(value);
  if (!reward) return [];
  const counted = arrayValue(reward.countedItems).flatMap((entry) => {
    const item = recordValue(entry);
    const label = stringValue(item?.type) ?? stringValue(item?.key);
    const uniqueName = stringValue(item?.uniqueName);
    return label ? [{ label, ...(uniqueName ? { externalIds: [wfcdItemId(uniqueName)] } : {}) }] : [];
  });
  return uniqueSubjects([
    ...arrayValue(reward.items).flatMap((item) => typeof item === "string" && item ? [{ label: item }] : []),
    ...counted,
  ]);
}

function uniqueSubjects(subjects: NonNullable<WorldStateWindowObservation["subjects"]>): NonNullable<WorldStateWindowObservation["subjects"]> {
  const result = new Map<string, NonNullable<WorldStateWindowObservation["subjects"]>[number]>();
  for (const subject of subjects) {
    const key = subject.label.toLocaleLowerCase();
    const existing = result.get(key);
    result.set(key, existing?.externalIds ? existing : subject);
  }
  return [...result.values()];
}

function wfcdItemId(value: string) {
  return { sourceId: "wfcd-items", namespace: "uniqueName", value };
}
