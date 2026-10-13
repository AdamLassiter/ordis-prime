import assert from "node:assert/strict";
import test from "node:test";
import { externalKey, normalizedAlias, resolveEntity, type EntityId, type EntityObservation, type ResolutionState } from "../src/index.ts";

const entityId = "weapon:braton" as EntityId;
const state: ResolutionState = {
  entities: new Map(),
  externalIds: new Map([[externalKey({ sourceId: "wfcd", namespace: "uniqueName", value: "/Lotus/Braton" }), entityId]]),
  aliases: new Map([[normalizedAlias("Braton"), [entityId]]]),
};
const base: EntityObservation = {
  type: "entity", kind: "weapon", externalIds: [], fields: { name: "Braton" },
  evidence: { sourceId: "wfcd", sourceRecordKey: "x", snapshotVersion: "1", retrievedAt: "2026-01-01T00:00:00Z" },
};

test("stable external IDs take precedence over names", () => {
  const result = resolveEntity({ ...base, fields: { name: "Renamed" }, externalIds: [{ sourceId: "wfcd", namespace: "uniqueName", value: "/Lotus/Braton" }] }, state);
  assert.deepEqual(result, { status: "matched", entityId, by: "external-id" });
});

test("ambiguous aliases become reviewable conflicts", () => {
  const other = "weapon:mk1-braton" as EntityId;
  const result = resolveEntity(base, { ...state, externalIds: new Map(), aliases: new Map([[normalizedAlias("Braton"), [entityId, other]]]) });
  assert.equal(result.status, "conflict");
});
