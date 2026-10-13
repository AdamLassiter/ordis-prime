import type { Observation } from "@ordis-prime/domain";
import type { Snapshot, SourceAdapter } from "../adapter.ts";

interface Reward { _id?: string; itemName?: string; chance?: number; rotation?: string }
interface Mission { gameMode?: string; rewards?: Record<string, Reward[]> }
interface DropsPayload { missionRewards?: Record<string, Record<string, Mission>> }

export class WfcdDropsAdapter implements SourceAdapter {
  readonly source = { id: "wfcd-drops", name: "WFCD warframe-drop-data", homepage: "https://github.com/WFCD/warframe-drop-data", license: "MIT", priority: 90 };
  private readonly url: string;
  constructor(url = "https://drops.warframestat.us/data/missionRewards.json") { this.url = url; }
  async fetch(context: { signal?: AbortSignal }): Promise<Snapshot> {
    const response = await fetch(this.url, { signal: context.signal, headers: { "User-Agent": "OrdisPrime/0.1 (+https://github.com/adamlassiter/ordis-prime)" } });
    if (!response.ok) throw new Error(`WFCD drops fetch failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { sourceId: this.source.id, version: response.headers.get("etag") ?? new Date().toISOString(), retrievedAt: new Date().toISOString(), contentHash: response.headers.get("etag") ?? `bytes:${bytes.length}`, mediaType: "application/json", bytes };
  }
  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const payload = JSON.parse(new TextDecoder().decode(snapshot.bytes)) as DropsPayload;
    for (const [planet, missions] of Object.entries(payload.missionRewards ?? {})) {
      for (const [node, mission] of Object.entries(missions)) {
        const nodeKey = `${planet}/${node}`;
        const evidence = { sourceId: this.source.id, sourceRecordKey: nodeKey, snapshotVersion: snapshot.version, retrievedAt: snapshot.retrievedAt, license: this.source.license, path: `missionRewards.${planet}.${node}` };
        yield { type: "entity", kind: "node", externalIds: [{ sourceId: this.source.id, namespace: "mission", value: nodeKey }], fields: { name: node, slug: slugify(`${planet}-${node}`), description: mission.gameMode ? `${mission.gameMode} on ${planet}` : undefined }, aliases: [`${node}, ${planet}`], evidence };
        for (const [rotation, rewards] of Object.entries(mission.rewards ?? {})) {
          for (const [rewardIndex, reward] of rewards.entries()) {
            if (!reward.itemName) continue;
            const rewardKey = reward._id ?? reward.itemName;
            const rewardEvidence = { ...evidence, sourceRecordKey: rewardKey, path: `${evidence.path}.rewards.${rotation}[${rewardIndex}]` };
            yield { type: "entity", kind: "component", externalIds: [{ sourceId: this.source.id, namespace: "reward", value: rewardKey }], fields: { name: reward.itemName, slug: slugify(reward.itemName) }, evidence: rewardEvidence };
            yield { type: "drop", rewardExternalId: { sourceId: this.source.id, namespace: "reward", value: rewardKey }, nodeExternalId: { sourceId: this.source.id, namespace: "mission", value: nodeKey }, locationLabel: `${node}, ${planet}`, chance: reward.chance == null ? undefined : reward.chance / 100, rotation: reward.rotation ?? rotation, evidence: rewardEvidence };
          }
        }
      }
    }
  }
}
function slugify(value: string) { return value.toLocaleLowerCase("en").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
