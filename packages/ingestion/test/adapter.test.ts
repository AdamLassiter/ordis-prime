import assert from "node:assert/strict";
import test from "node:test";
import { collect, DEFAULT_WFCD_ITEMS_URL, WfcdDropsAdapter, WfcdItemsAdapter, type Snapshot } from "../src/index.ts";

const snapshot: Snapshot = { sourceId: "wfcd-items", version: "fixture-1", retrievedAt: "2026-01-01T00:00:00Z", contentHash: "fixture", mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify([{ uniqueName: "/Lotus/Powersuits/Ash/Ash", name: "Ash", description: "Smoke and blades.", category: "Warframes" }, { uniqueName: "/ignored", name: "Ignored", category: "Unknown" }])) };

test("WFCD adapter emits source-neutral, evidenced observations", async () => {
  const observations = await collect(new WfcdItemsAdapter(), snapshot);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.type, "entity");
  assert.equal(observations[0]?.evidence.sourceRecordKey, "/Lotus/Powersuits/Ash/Ash");
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
    assert.equal(fetched.version, "fixture-etag");
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
  assert.equal(drop?.chance, 0.1429);
  assert.equal(drop?.locationLabel, "Tessera, Venus");
});
