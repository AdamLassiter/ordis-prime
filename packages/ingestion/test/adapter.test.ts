import assert from "node:assert/strict";
import test from "node:test";
import { collect, DEFAULT_WFCD_ITEMS_URL, WfcdDropsAdapter, WfcdItemsAdapter, type Snapshot } from "../src/index.ts";

const snapshot: Snapshot = { sourceId: "wfcd-items", version: "fixture-1", retrievedAt: "2026-01-01T00:00:00Z", contentHash: "fixture", mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify([{ uniqueName: "/Lotus/Powersuits/Ash/Ash", name: "Ash", description: "Smoke and blades.", category: "Warframes" }, { uniqueName: "/ignored", name: "Ignored", category: "Unknown" }])) };

test("WFCD adapter emits source-neutral, evidenced observations", async () => {
  const observations = await collect(new WfcdItemsAdapter(), snapshot);
  assert.equal(observations.length, 2);
  assert.equal(observations[0]?.type, "entity");
  assert.equal(observations[0]?.evidence.sourceRecordKey, "/Lotus/Powersuits/Ash/Ash");
  assert.equal(observations[1]?.type === "entity" && observations[1].kind, "unknown");
});

test("WFCD component references retain trustworthy item kinds and qualified part names", async () => {
  const componentSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(JSON.stringify([
      { uniqueName: "/alloy", name: "Adramal Alloy", category: "Resources", components: [
        { uniqueName: "/ore", name: "Adramalium", category: "Resources", itemCount: 20 },
        { uniqueName: "/blueprint", name: "Blueprint", category: "Components", itemCount: 1 },
      ] },
    ])),
  };
  const observations = await collect(new WfcdItemsAdapter(), componentSnapshot);
  const entities = observations.filter((entry) => entry.type === "entity");
  assert.deepEqual(entities.map((entry) => [entry.kind, entry.fields.name]), [
    ["resource", "Adramal Alloy"],
    ["resource", "Adramalium"],
    ["component", "Adramal Alloy Blueprint"],
  ]);
});

test("WFCD adapter distinguishes arcanes and provider-miscategorised Archon Shards", async () => {
  const specialItemSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(JSON.stringify([
      { uniqueName: "/Lotus/Upgrades/CosmeticEnhancers/Defensive/GolemArcaneBarrier", name: "Arcane Barrier", category: "Arcanes", type: "Warframe Arcane" },
      { uniqueName: "/Lotus/Types/Gameplay/NarmerSorties/ArchonCrystalAmarMythic", name: "Tauforged Crimson Archon Shard", category: "Misc", type: "Misc" },
    ])),
  };
  const observations = await collect(new WfcdItemsAdapter(), specialItemSnapshot);
  assert.deepEqual(observations.filter((entry) => entry.type === "entity").map((entry) => [entry.kind, entry.fields.name]), [
    ["arcane", "Arcane Barrier"],
    ["shard", "Tauforged Crimson Archon Shard"],
  ]);
});

test("WFCD node records retain planet and level metadata", async () => {
  const nodeSnapshot = {
    ...snapshot,
    bytes: new TextEncoder().encode(JSON.stringify([{ uniqueName: "SolNode22", name: "Tessera", category: "Node", systemName: "Venus", minEnemyLevel: 3, maxEnemyLevel: 5, masteryReq: 0, nodeType: 0 }])),
  };
  const observations = await collect(new WfcdItemsAdapter(), nodeSnapshot);
  assert.deepEqual(observations.find((entry) => entry.type === "node-detail"), {
    type: "node-detail", nodeExternalId: { sourceId: "wfcd-items", namespace: "uniqueName", value: "SolNode22" },
    planet: "Venus", minimumEnemyLevel: 3, maximumEnemyLevel: 5, masteryRequirement: 0, nodeType: 0,
    evidence: { sourceId: "wfcd-items", sourceRecordKey: "SolNode22", snapshotVersion: "fixture-1", retrievedAt: "2026-01-01T00:00:00Z", citationUrl: undefined, license: "MIT", path: "[0]" },
  });
});

test("empty snapshots fail closed", async () => {
  await assert.rejects(() => collect(new WfcdItemsAdapter(), { ...snapshot, bytes: new TextEncoder().encode("[]") }), /produced no observations/);
});

test("WFCD adapter defaults to the maintained aggregate endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response("[]", { headers: { etag: "fixture-etag", "content-type": "application/json" } });
  };
  try {
    const fetched = await new WfcdItemsAdapter().fetch({});
    assert.equal(requestedUrl, DEFAULT_WFCD_ITEMS_URL);
    assert.equal(fetched.version, "fixture-etag|wfcd-items-v3");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("drop adapter joins node and reward through stable provider IDs", async () => {
  const drops = new WfcdDropsAdapter();
  const observations = await collect(drops, {
    ...snapshot,
    sourceId: "wfcd-drops",
    bytes: new TextEncoder().encode(JSON.stringify({ missionRewards: { Venus: { Tessera: { gameMode: "Defense", rewards: { A: [{ _id: "reward-1", itemName: "Lith A1 Relic", chance: 14.29 }] } } } } })),
  });
  assert.equal(observations.filter((entry) => entry.type === "entity").length, 2);
  const drop = observations.find((entry) => entry.type === "drop");
  const reward = observations.find((entry) => entry.type === "entity" && entry.kind === "unknown");
  const nodeDetail = observations.find((entry) => entry.type === "node-detail");
  assert.equal(reward?.type, "entity");
  if (reward?.type === "entity") assert.equal(reward.fields.name, "Lith A1 Relic");
  assert.equal(drop?.chance, 0.1429);
  assert.equal(drop?.locationLabel, "Tessera, Venus");
  assert.equal(nodeDetail?.type === "node-detail" && nodeDetail.missionType, "Defense");
});

test("drop adapter supports missions without named rotations", async () => {
  const observations = await collect(new WfcdDropsAdapter(), {
    ...snapshot,
    sourceId: "wfcd-drops",
    bytes: new TextEncoder().encode(JSON.stringify({ missionRewards: { Mercury: { Elion: { gameMode: "Capture", rewards: [{ _id: "reward-2", itemName: "Vitality", chance: 10.84 }] } } } })),
  });
  const drop = observations.find((entry) => entry.type === "drop");
  assert.equal(drop?.rotation, undefined);
  assert.equal(drop?.chance, 0.1084);
});
