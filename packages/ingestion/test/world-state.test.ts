import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listCurrentWorldState, migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import { createSnapshot, refreshWorldState, SnapshotStore, WfcdWorldStateAdapter, type Snapshot, type WorldStateAdapter } from "../src/index.ts";

test("WFCD world state normalizes availability windows and promotes one active snapshot", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-world-state-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const parser = new WfcdWorldStateAdapter("https://example.test");
  let version = 1;
  const adapter: WorldStateAdapter = {
    source: parser.source,
    fetch: async () => fixtureSnapshot(version++),
    parse: (snapshot) => parser.parse(snapshot),
  };
  const snapshotStore = new SnapshotStore(path.join(root, "sources"));

  const first = await refreshWorldState({ adapter, database, snapshotStore });
  assert.equal(first.windowCount, 5);
  assert.deepEqual(listCurrentWorldState(database, Date.parse("2026-10-13T21:00:00.000Z")).map(({ kind }) => kind).sort(), ["alert", "cycle", "event", "fissure", "trader"]);
  const second = await refreshWorldState({ adapter, database, snapshotStore });
  assert.notEqual(second.snapshotId, first.snapshotId);
  assert.equal((database.prepare("select count(*) as count from world_state_snapshots where active = 1").get() as { count: number }).count, 1);
  assert.equal((database.prepare("select count(*) as count from world_state_snapshots").get() as { count: number }).count, 2);
  assert.equal((database.prepare("select count(*) as count from source_refreshes where world_state_snapshot_id is not null and status = 'succeeded'").get() as { count: number }).count, 2);
});

function fixtureSnapshot(version: number): Snapshot {
  const timestamp = `2026-10-13T21:0${version}:00.000Z`;
  const payload = {
    timestamp,
    cetusCycle: { id: `cetus-${version}`, activation: "2026-10-13T20:30:00.000Z", expiry: "2026-10-13T22:00:00.000Z", state: "night" },
    events: [{ id: `event-${version}`, activation: "2026-10-13T20:00:00.000Z", expiry: "2026-10-20T20:00:00.000Z", description: "Thermia Fractures", node: "Orb Vallis" }],
    alerts: [{ id: `alert-${version}`, activation: "2026-10-13T20:00:00.000Z", expiry: "2026-10-14T20:00:00.000Z", mission: { node: "Mantle (Earth)", type: "Capture", reward: { items: ["Forma"] } } }],
    fissures: [{ id: `fissure-${version}`, activation: "2026-10-13T20:00:00.000Z", expiry: "2026-10-13T22:30:00.000Z", tier: "Lith", missionType: "Defense", node: "Romula (Venus)" }],
    voidTraders: [{ id: `trader-${version}`, activation: "2026-10-13T20:00:00.000Z", expiry: "2026-10-15T20:00:00.000Z", location: "Larunda Relay (Mercury)", character: "Baro Ki'Teer" }],
  };
  return createSnapshot({ sourceId: "wfcd-worldstate", version: timestamp, retrievedAt: timestamp, mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify(payload)) });
}
