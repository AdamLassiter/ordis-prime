import type { Observation } from "@ordis-prime/domain";
import {
  createSnapshot,
  type Snapshot,
  type SourceAdapter,
} from "../adapter.ts";
import {
  canonicalWfcdItemIdentities,
  DEFAULT_WFCD_ITEMS_URL,
  type CanonicalWfcdItemIdentity,
  type WfcdItemIdentity,
} from "./wfcd-items.ts";

interface Reward {
  _id?: string;
  itemName?: string;
  chance?: number;
  rotation?: string;
}
interface Mission {
  gameMode?: string;
  rewards?: Reward[] | Record<string, Reward[]>;
}
interface DropsPayload {
  missionRewards?: Record<string, Record<string, Mission>>;
  modNames?: string[];
  itemIdentities?: CanonicalWfcdItemIdentity[];
}
interface ModLocationsPayload {
  modLocations?: Array<{ modName?: string }>;
}
const PARSER_VERSION = "wfcd-drops-v6";
const DEFAULT_DROPS_URL =
  "https://drops.warframestat.us/data/missionRewards.json";
const DEFAULT_MOD_LOCATIONS_URL =
  "https://drops.warframestat.us/data/modLocations.json";

export class WfcdDropsAdapter implements SourceAdapter {
  readonly minimumRetainedObservationRatio = 0.5;
  readonly source = {
    id: "wfcd-drops",
    name: "WFCD warframe-drop-data",
    homepage: "https://github.com/WFCD/warframe-drop-data",
    license: "MIT",
    priority: 90,
  };
  private readonly url: string;
  private readonly modLocationsUrl: string;
  private readonly itemsUrl: string;
  constructor(
    url = DEFAULT_DROPS_URL,
    modLocationsUrl = DEFAULT_MOD_LOCATIONS_URL,
    itemsUrl = DEFAULT_WFCD_ITEMS_URL,
  ) {
    this.url = url;
    this.modLocationsUrl = modLocationsUrl;
    this.itemsUrl = itemsUrl;
  }
  async fetch(context: { signal?: AbortSignal }): Promise<Snapshot> {
    const headers = {
      "User-Agent":
        "OrdisPrime/0.1 (+https://github.com/adamlassiter/ordis-prime)",
    };
    const [dropResponse, modResponse, itemResponse] = await Promise.all([
      fetch(this.url, { signal: context.signal, headers }),
      fetch(this.modLocationsUrl, { signal: context.signal, headers }),
      fetch(this.itemsUrl, { signal: context.signal, headers }),
    ]);
    if (!dropResponse.ok)
      throw new Error(`WFCD drops fetch failed: ${dropResponse.status}`);
    if (!modResponse.ok)
      throw new Error(`WFCD mod locations fetch failed: ${modResponse.status}`);
    if (!itemResponse.ok)
      throw new Error(
        `WFCD item identity fetch failed: ${itemResponse.status}`,
      );
    const drops = (await dropResponse.json()) as DropsPayload;
    const modLocations = (await modResponse.json()) as ModLocationsPayload;
    const items = (await itemResponse.json()) as WfcdItemIdentity[];
    if (!Array.isArray(items))
      throw new Error("WFCD item identity payload must be an array");
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        ...drops,
        modNames: (modLocations.modLocations ?? []).flatMap(({ modName }) =>
          modName ? [modName] : [],
        ),
        itemIdentities: canonicalWfcdItemIdentities(items).map((item) => ({
          uniqueName: item.uniqueName,
          name: item.name,
          category: item.category,
          type: item.type,
          productCategory: item.productCategory,
          kind: item.kind,
        })),
      }),
    );
    const upstreamVersion =
      [
        dropResponse.headers.get("etag"),
        modResponse.headers.get("etag"),
        itemResponse.headers.get("etag"),
      ]
        .filter(Boolean)
        .join("+") || new Date().toISOString();
    return createSnapshot({
      sourceId: this.source.id,
      version: `${upstreamVersion}|${PARSER_VERSION}`,
      retrievedAt: new Date().toISOString(),
      mediaType: "application/json",
      bytes,
    });
  }
  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    const payload = JSON.parse(
      new TextDecoder().decode(snapshot.bytes),
    ) as DropsPayload;
    const modNames = new Set(payload.modNames ?? []);
    const itemIdentities = uniqueItemIdentities(payload.itemIdentities ?? []);
    for (const [planet, missions] of Object.entries(
      payload.missionRewards ?? {},
    )) {
      for (const [node, mission] of Object.entries(missions)) {
        const nodeKey = `${planet}/${node}`;
        const evidence = {
          sourceId: this.source.id,
          sourceRecordKey: nodeKey,
          snapshotVersion: snapshot.version,
          retrievedAt: snapshot.retrievedAt,
          license: this.source.license,
          path: `missionRewards.${planet}.${node}`,
        };
        yield {
          type: "entity",
          kind: "node",
          externalIds: [
            { sourceId: this.source.id, namespace: "mission", value: nodeKey },
          ],
          fields: {
            name: node,
            slug: slugify(`${planet}-${node}`),
            description: mission.gameMode
              ? `${mission.gameMode} on ${planet}`
              : undefined,
          },
          aliases: [`${node}, ${planet}`],
          evidence,
        };
        yield {
          type: "node-detail",
          nodeExternalId: {
            sourceId: this.source.id,
            namespace: "mission",
            value: nodeKey,
          },
          planet,
          missionType: mission.gameMode,
          evidence,
        };
        const rewardGroups: Array<[string | undefined, Reward[]]> =
          Array.isArray(mission.rewards)
            ? [[undefined, mission.rewards]]
            : Object.entries(mission.rewards ?? {});
        for (const [rotation, rewards] of rewardGroups) {
          for (const [rewardIndex, reward] of rewards.entries()) {
            if (!reward.itemName) continue;
            const rewardKey = reward._id ?? reward.itemName;
            const identities = itemIdentities.get(
              normalizedName(reward.itemName),
            );
            const identity = identities?.[0];
            const rewardEvidence = {
              ...evidence,
              sourceRecordKey: rewardKey,
              path: `${evidence.path}.rewards.${rotation}[${rewardIndex}]`,
            };
            yield {
              type: "entity",
              kind: identity?.kind ?? rewardKind(reward.itemName, modNames),
              externalIds: [
                {
                  sourceId: this.source.id,
                  namespace: "reward",
                  value: rewardKey,
                },
                ...(identities ?? []).map(({ uniqueName }) => ({
                  sourceId: "wfcd-items",
                  namespace: "uniqueName",
                  value: uniqueName,
                })),
              ],
              fields: {
                name: identity?.name ?? reward.itemName,
                slug: slugify(identity?.name ?? reward.itemName),
              },
              evidence: rewardEvidence,
            };
            yield {
              type: "drop",
              rewardExternalId: {
                sourceId: identity?.uniqueName ? "wfcd-items" : this.source.id,
                namespace: identity?.uniqueName ? "uniqueName" : "reward",
                value: identity?.uniqueName ?? rewardKey,
              },
              nodeExternalId: {
                sourceId: this.source.id,
                namespace: "mission",
                value: nodeKey,
              },
              locationLabel: `${node}, ${planet}`,
              chance: reward.chance == null ? undefined : reward.chance / 100,
              rotation: reward.rotation ?? rotation,
              evidence: rewardEvidence,
            };
          }
        }
      }
    }
  }
}
function uniqueItemIdentities(items: CanonicalWfcdItemIdentity[]) {
  const grouped = new Map<string, CanonicalWfcdItemIdentity[]>();
  for (const item of items) {
    if (!item.uniqueName || !item.name) continue;
    const key = normalizedName(item.name);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return new Map(
    [...grouped.entries()].flatMap(([key, candidates]) => {
      const rewardCandidates = candidates.filter(
        ({ kind }) =>
          ![
            "ability",
            "boss",
            "challenge",
            "enemy",
            "node",
            "quest",
            "vendor",
          ].includes(kind),
      );
      const kinds = new Set(rewardCandidates.map(({ kind }) => kind));
      return rewardCandidates.length && kinds.size === 1
        ? [[key, rewardCandidates] as const]
        : [];
    }),
  );
}

function normalizedName(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "");
}
function rewardKind(itemName: string, modNames: Set<string>) {
  if (modNames.has(itemName)) return "mod" as const;
  if (/^(?:Lith|Meso|Neo|Axi|Requiem)\s.+\sRelic(?:\s\(.+\))?$/i.test(itemName))
    return "relic" as const;
  if (/Blueprint$/i.test(itemName)) return "blueprint" as const;
  if (
    /(?:^|\s)(?:Endo|Credits? Cache|Höllars? Cache)$/i.test(itemName) ||
    /^\d+(?:X| ×)\s/i.test(itemName)
  )
    return "resource" as const;
  return "misc" as const;
}
function slugify(value: string) {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
