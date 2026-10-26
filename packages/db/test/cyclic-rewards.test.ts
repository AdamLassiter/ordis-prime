import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Observation } from "@ordis-prime/domain";
import {
  createLocalUser,
  createWorldStateWatch,
  evaluateWorldStateWatches,
  findCatalogItem,
  listCurrentWorldState,
  listCyclicRewardSchedules,
  listPlayerNotifications,
  migrateDatabase,
  openSqliteDatabase,
  promoteSource,
  pruneInactiveCatalogHistory,
} from "../src/index.ts";

test("cyclic rewards drive schedule, catalog, world-state, and watch read models", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-cyclic-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const retrievedAt = "2026-10-19T00:00:00.000Z";
  const evidence = (key: string) => ({
    sourceId: "schedule",
    sourceRecordKey: key,
    snapshotVersion: "v1",
    retrievedAt,
    citationUrl: "https://example.test/schedule",
  });
  const observations: Observation[] = [
    {
      type: "entity",
      kind: "warframe",
      externalIds: [{ sourceId: "schedule", namespace: "id", value: "ash" }],
      fields: { name: "Ash", slug: "ash" },
      evidence: evidence("ash"),
    },
    {
      type: "entity",
      kind: "mod",
      externalIds: [
        { sourceId: "schedule", namespace: "id", value: "augment" },
      ],
      fields: { name: "Seeking Shuriken", slug: "seeking-shuriken" },
      evidence: evidence("augment"),
    },
    {
      type: "cyclic-reward-schedule",
      key: "circuit-normal",
      label: "Normal Circuit",
      epoch: retrievedAt,
      intervalSeconds: 604_800,
      phaseCount: 2,
      choicesPerPhase: 1,
      selectionsAllowed: 1,
      instructions: "Choose one path.",
      evidence: evidence("schedule"),
    },
    {
      type: "cyclic-reward-choice",
      scheduleKey: "circuit-normal",
      phaseIndex: 0,
      phaseLabel: "Week 1",
      position: 0,
      primary: { label: "Ash", expectedKind: "warframe" },
      acquisitionMode: "path",
      includedRewards: [
        { label: "Seeking Shuriken", expectedKind: "mod", tier: 7 },
      ],
      evidence: evidence("week-1"),
    },
    {
      type: "cyclic-reward-choice",
      scheduleKey: "circuit-normal",
      phaseIndex: 1,
      phaseLabel: "Week 2",
      position: 0,
      primary: { label: "Ember", expectedKind: "warframe" },
      acquisitionMode: "path",
      evidence: evidence("week-2"),
    },
  ];
  const result = promoteSource(sqlite, {
    source: {
      id: "schedule",
      name: "Schedule fixture",
      homepage: "https://example.test",
      priority: 10,
    },
    version: "v1",
    contentHash: `sha256:${"circuit".padEnd(64, "0")}`,
    retrievedAt,
    observations,
  });
  assert.equal(result.cyclicRewardSchedulesCreated, 1);
  assert.equal(result.cyclicRewardChoicesCreated, 2);

  const now = Date.parse("2026-10-20T12:00:00.000Z");
  const [schedule] = listCyclicRewardSchedules(sqlite, now);
  assert.equal(schedule?.currentPhaseIndex, 0);
  assert.equal(schedule?.nextPhaseIndex, 1);
  assert.equal(schedule?.choices[0]?.primary.entity?.name, "Ash");
  assert.equal(
    schedule?.choices[0]?.includedRewards[0]?.entity?.name,
    "Seeking Shuriken",
  );
  assert.equal(
    findCatalogItem(sqlite, "warframe", "ash", now)?.cyclicRewards[0]?.current,
    true,
  );

  const rotationWindows = listCurrentWorldState(sqlite, now).filter(
    (window) => window.kind === "rotation",
  );
  assert.equal(rotationWindows.length, 2);
  assert.equal(rotationWindows[0]?.subjects[0]?.name, "Ash");

  const userId = createLocalUser(sqlite, { username: "Tenno" });
  createWorldStateWatch(sqlite, userId, {
    kind: "rotation",
    labelContains: "Normal Circuit",
    trigger: "ending",
    leadMinutes: 10_080,
  });
  assert.equal(evaluateWorldStateWatches(sqlite, now, userId), 1);
  assert.match(
    listPlayerNotifications(sqlite, userId)[0]!.title,
    /ending soon/,
  );

  const v2RetrievedAt = "2026-10-20T00:00:00.000Z";
  promoteSource(sqlite, {
    source: {
      id: "schedule",
      name: "Schedule fixture",
      homepage: "https://example.test",
      priority: 10,
    },
    version: "v2",
    contentHash: `sha256:${"circuit-v2".padEnd(64, "0")}`,
    retrievedAt: v2RetrievedAt,
    observations: observations.map((observation) => ({
      ...observation,
      evidence: {
        ...observation.evidence,
        snapshotVersion: "v2",
        retrievedAt: v2RetrievedAt,
      },
    })),
  });
  assert.equal(pruneInactiveCatalogHistory(sqlite, 0).sourceRunsDeleted, 1);
});

test("typed cyclic rewards resolve same-name entities without guessing untyped subjects", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-cyclic-typed-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  migrateDatabase(databasePath);
  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const retrievedAt = "2026-10-19T00:00:00.000Z";
  const evidence = (key: string) => ({
    sourceId: "schedule",
    sourceRecordKey: key,
    snapshotVersion: "v1",
    retrievedAt,
  });
  const result = promoteSource(sqlite, {
    source: {
      id: "schedule",
      name: "Schedule fixture",
      homepage: "https://example.test",
      priority: 10,
    },
    version: "v1",
    contentHash: `sha256:${"typed-circuit".padEnd(64, "0")}`,
    retrievedAt,
    observations: [
      {
        type: "entity",
        kind: "warframe",
        externalIds: [
          { sourceId: "schedule", namespace: "id", value: "chroma-frame" },
        ],
        fields: { name: "Chroma", slug: "chroma" },
        evidence: evidence("chroma-frame"),
      },
      {
        type: "entity",
        kind: "enemy",
        externalIds: [
          { sourceId: "schedule", namespace: "id", value: "chroma-enemy" },
        ],
        fields: { name: "Chroma", slug: "chroma" },
        evidence: evidence("chroma-enemy"),
      },
      {
        type: "cyclic-reward-schedule",
        key: "circuit-normal",
        label: "Normal Circuit",
        epoch: retrievedAt,
        intervalSeconds: 604_800,
        phaseCount: 2,
        choicesPerPhase: 1,
        selectionsAllowed: 1,
        instructions: "Choose one path.",
        evidence: evidence("schedule"),
      },
      {
        type: "cyclic-reward-choice",
        scheduleKey: "circuit-normal",
        phaseIndex: 0,
        phaseLabel: "Week 1",
        position: 0,
        primary: { label: "Chroma", expectedKind: "warframe" },
        acquisitionMode: "path",
        evidence: evidence("typed-chroma"),
      },
      {
        type: "cyclic-reward-choice",
        scheduleKey: "circuit-normal",
        phaseIndex: 1,
        phaseLabel: "Week 2",
        position: 0,
        primary: { label: "Chroma" },
        acquisitionMode: "path",
        evidence: evidence("untyped-chroma"),
      },
    ],
  });

  assert.equal(result.conflictsCreated, 1);
  const schedule = listCyclicRewardSchedules(
    sqlite,
    Date.parse(retrievedAt),
  )[0];
  assert.equal(schedule?.choices[0]?.primary.entity?.kind, "warframe");
  assert.equal(schedule?.choices[0]?.primary.entity?.slug, "chroma");
  assert.equal(schedule?.choices[1]?.primary.entity, undefined);
  const conflict = sqlite
    .prepare(
      "select record_key as recordKey, candidates_json as candidatesJson from ingestion_conflicts",
    )
    .get() as { recordKey: string; candidatesJson: string };
  assert.equal(conflict.recordKey, "untyped-chroma");
  assert.equal((JSON.parse(conflict.candidatesJson) as string[]).length, 2);
});
