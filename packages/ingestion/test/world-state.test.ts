import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listCurrentWorldState,
  listWorldStateSourceStatuses,
  migrateDatabase,
  openSqliteDatabase,
} from "@ordis-prime/db";
import {
  createSnapshot,
  refreshWorldState,
  SnapshotStore,
  WfcdWorldStateAdapter,
  type Snapshot,
  type WorldStateAdapter,
} from "../src/index.ts";

test("WFCD world state normalizes availability windows and promotes one active snapshot", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-world-state-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('mantle', 'node', 'Mantle', 'earth-mantle', 0, ?)",
    )
    .run(Date.now());
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('forma', 'resource', 'Forma', 'forma', 0, ?)",
    )
    .run(Date.now());
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
  const current = listCurrentWorldState(
    database,
    Date.parse("2026-10-13T21:00:00.000Z"),
  );
  assert.deepEqual(current.map(({ kind }) => kind).sort(), [
    "alert",
    "cycle",
    "event",
    "fissure",
    "trader",
  ]);
  assert.equal(
    current.find(({ kind }) => kind === "alert")?.label,
    "Alert: Forma",
  );
  assert.deepEqual(
    current.find(({ kind }) => kind === "alert")?.subjectLabels,
    ["Forma"],
  );
  assert.deepEqual(current.find(({ kind }) => kind === "alert")?.subjects, [
    { kind: "resource", slug: "forma", name: "Forma" },
  ]);
  assert.deepEqual(current.find(({ kind }) => kind === "alert")?.node, {
    slug: "earth-mantle",
    name: "Mantle",
  });
  assert.equal(current.find(({ kind }) => kind === "fissure")?.node, undefined);
  const second = await refreshWorldState({ adapter, database, snapshotStore });
  assert.notEqual(second.snapshotId, first.snapshotId);
  version = 0;
  await assert.rejects(
    refreshWorldState({ adapter, database, snapshotStore }),
    /was observed before active snapshot/,
  );
  assert.deepEqual(
    database
      .prepare(
        "select status, records_processed as recordsProcessed from source_refreshes order by rowid desc limit 1",
      )
      .get(),
    { status: "failed", recordsProcessed: 5 },
  );
  assert.equal(
    (
      database
        .prepare(
          "select id from world_state_snapshots where active = 1 limit 1",
        )
        .get() as { id: string }
    ).id,
    second.snapshotId,
  );
  assert.equal(
    (
      database
        .prepare(
          "select count(*) as count from world_state_snapshots where active = 1",
        )
        .get() as { count: number }
    ).count,
    1,
  );
  assert.equal(
    (
      database
        .prepare("select count(*) as count from world_state_snapshots")
        .get() as { count: number }
    ).count,
    2,
  );
  assert.equal(
    (
      database
        .prepare(
          "select count(*) as count from source_refreshes where world_state_snapshot_id is not null and status = 'succeeded'",
        )
        .get() as { count: number }
    ).count,
    2,
  );
  assert.deepEqual(
    listWorldStateSourceStatuses(
      database,
      Date.parse("2026-10-13T21:00:00.000Z"),
    ).map(({ sourceId, windowCount, currentWindowCount }) => ({
      sourceId,
      windowCount,
      currentWindowCount,
    })),
    [{ sourceId: "wfcd-worldstate", windowCount: 5, currentWindowCount: 5 }],
  );
});

function fixtureSnapshot(version: number): Snapshot {
  const timestamp = `2026-10-13T21:0${version}:00.000Z`;
  const payload = {
    timestamp,
    cetusCycle: {
      id: `cetus-${version}`,
      activation: "2026-10-13T20:30:00.000Z",
      expiry: "2026-10-13T22:00:00.000Z",
      state: "night",
    },
    events: [
      {
        id: `event-${version}`,
        activation: "2026-10-13T20:00:00.000Z",
        expiry: "2026-10-20T20:00:00.000Z",
        description: "Thermia Fractures",
        node: "Orb Vallis",
      },
    ],
    alerts: [
      {
        id: `alert-${version}`,
        activation: "2026-10-13T20:00:00.000Z",
        expiry: "2026-10-14T20:00:00.000Z",
        mission: {
          node: "Mantle (Earth)",
          type: "Capture",
          reward: {
            items: ["Forma"],
            countedItems: [{ type: "Forma", count: 1 }],
          },
        },
      },
    ],
    fissures: [
      {
        id: `fissure-${version}`,
        activation: "2026-10-13T20:00:00.000Z",
        expiry: "2026-10-13T22:30:00.000Z",
        tier: "Lith",
        missionType: "Defense",
        node: "Romula (Venus)",
      },
    ],
    voidTraders: [
      {
        id: `trader-${version}`,
        activation: "2026-10-13T20:00:00.000Z",
        expiry: "2026-10-15T20:00:00.000Z",
        location: "Larunda Relay (Mercury)",
        character: "Baro Ki'Teer",
      },
    ],
  };
  return createSnapshot({
    sourceId: "wfcd-worldstate",
    version: timestamp,
    retrievedAt: timestamp,
    mediaType: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify(payload)),
  });
}
