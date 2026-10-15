import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  bindSourceIdentityOverride,
  migrateDatabase,
  openSqliteDatabase,
} from "@ordis-prime/db";
import type { Observation } from "@ordis-prime/domain";
import {
  createSnapshot,
  refreshSource,
  SnapshotStore,
  type Snapshot,
  type SourceAdapter,
} from "../src/index.ts";

test("refresh archives, parses, and promotes any source adapter", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-refresh-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());

  const result = await refreshSource({
    adapter: new FixtureAdapter(),
    database,
    snapshotStore: new SnapshotStore(path.join(root, "sources")),
  });

  assert.equal(result.observationCount, 1);
  assert.equal(result.entitiesCreated, 1);
  assert.equal(
    (database.prepare("select name from entities").get() as { name: string })
      .name,
    "Forma",
  );
  assert.equal(
    (
      database.prepare("select status from source_runs").get() as {
        status: string;
      }
    ).status,
    "active",
  );
  assert.deepEqual(
    database
      .prepare(
        "select status, source_run_id is not null as linked, snapshot_path as snapshotPath, error from source_refreshes",
      )
      .get(),
    {
      status: "succeeded",
      linked: 1,
      snapshotPath: result.snapshotPath,
      error: null,
    },
  );
  assert.equal(
    (await fs.stat(path.join(result.snapshotPath, "payload"))).isFile(),
    true,
  );
});

test("refresh failures are persisted without replacing active data", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-refresh-failure-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const snapshotStore = new SnapshotStore(path.join(root, "sources"));
  await refreshSource({
    adapter: new FixtureAdapter(),
    database,
    snapshotStore,
  });
  const failing = new FixtureAdapter();
  failing.fetch = async () => {
    throw new Error("upstream unavailable");
  };

  await assert.rejects(
    refreshSource({ adapter: failing, database, snapshotStore }),
    /upstream unavailable/,
  );
  assert.equal(
    (
      database
        .prepare(
          "select count(*) as count from source_runs where status = 'active'",
        )
        .get() as { count: number }
    ).count,
    1,
  );
  assert.deepEqual(
    database
      .prepare(
        "select status, error from source_refreshes order by started_at desc, rowid desc limit 1",
      )
      .get(),
    {
      status: "failed",
      error: "Error: upstream unavailable",
    },
  );
});

test("identity override revisions replay unchanged source snapshots", async (context) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "ordis-refresh-override-"),
  );
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  context.after(() => database.close());
  const now = 1_800_000_000_000;
  database
    .prepare(
      "insert into users (id, username, email, email_verified, role, created_at, updated_at) values ('admin', 'Operator', 'operator@example.test', 1, 'admin', ?, ?)",
    )
    .run(now, now);
  database
    .prepare(
      "insert into entities (id, kind, name, slug, retired, updated_at) values ('one', 'resource', 'First', 'first', 0, ?), ('two', 'resource', 'Second', 'second', 0, ?)",
    )
    .run(now, now);
  database
    .prepare(
      "insert into entity_aliases (entity_id, normalized, display) values ('one', 'shared', 'Shared'), ('two', 'shared', 'Shared')",
    )
    .run();
  const adapter = new AmbiguousFixtureAdapter();
  const snapshotStore = new SnapshotStore(path.join(root, "sources"));

  const first = await refreshSource({ adapter, database, snapshotStore });
  assert.equal(first.conflictsCreated, 1);
  const conflict = database
    .prepare(
      "select id, external_ids_json as externalIdsJson from ingestion_conflicts",
    )
    .get() as { id: string; externalIdsJson: string };
  const externalId = {
    sourceId: adapter.source.id,
    namespace: "fixture",
    value: "shared",
  };
  assert.deepEqual(JSON.parse(conflict.externalIdsJson), [externalId]);
  bindSourceIdentityOverride(database, {
    sourceId: adapter.source.id,
    conflictId: conflict.id,
    userId: "admin",
    externalId,
    entityId: "one",
    note: "Verified identity",
    now,
  });

  const second = await refreshSource({ adapter, database, snapshotStore });
  assert.equal(second.conflictsCreated, 0);
  assert.match(
    (
      database
        .prepare("select version from source_runs where status = 'active'")
        .get() as { version: string }
    ).version,
    /^fixture-v1\|identity-overrides:1-/,
  );
  assert.deepEqual(
    database
      .prepare(
        "select entity_id as entityId from external_ids where source_id = ? and namespace = 'fixture' and value = 'shared'",
      )
      .get(adapter.source.id),
    { entityId: "one" },
  );
});

class FixtureAdapter implements SourceAdapter {
  readonly source = {
    id: "fixture-refresh",
    name: "Fixture refresh",
    homepage: "https://example.test",
    license: "CC0",
    priority: 1,
  };

  async fetch(): Promise<Snapshot> {
    return createSnapshot({
      sourceId: this.source.id,
      version: "fixture-v1",
      retrievedAt: "2026-10-13T12:00:00.000Z",
      mediaType: "application/json",
      bytes: new TextEncoder().encode('{"name":"Forma"}'),
    });
  }

  async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    yield {
      type: "entity",
      kind: "resource",
      externalIds: [
        { sourceId: this.source.id, namespace: "fixture", value: "forma" },
      ],
      fields: { name: "Forma", slug: "forma" },
      evidence: {
        sourceId: this.source.id,
        sourceRecordKey: "forma",
        snapshotVersion: snapshot.version,
        retrievedAt: snapshot.retrievedAt,
      },
    };
  }
}

class AmbiguousFixtureAdapter extends FixtureAdapter {
  override async *parse(snapshot: Snapshot): AsyncIterable<Observation> {
    yield {
      type: "entity",
      kind: "resource",
      externalIds: [
        { sourceId: this.source.id, namespace: "fixture", value: "shared" },
      ],
      fields: { name: "Shared", slug: "shared" },
      evidence: {
        sourceId: this.source.id,
        sourceRecordKey: "shared",
        snapshotVersion: snapshot.version,
        retrievedAt: snapshot.retrievedAt,
      },
    };
  }
}
