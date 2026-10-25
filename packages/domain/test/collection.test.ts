import assert from "node:assert/strict";
import test from "node:test";
import { deriveCollectionState } from "../src/index.ts";

test("collection state distinguishes acquisition, explicit intent, mastery suggestion, and goals", () => {
  assert.deepEqual(
    deriveCollectionState({
      kind: "weapon",
      ownedCount: 0,
      builtCount: 0,
      wantedCount: 0,
      mastered: true,
    }),
    {
      acquired: false,
      masteryCapable: true,
      explicitlyWanted: false,
      implicitlyWanted: false,
      requiredByGoal: false,
      wanted: false,
    },
  );
  assert.deepEqual(
    deriveCollectionState({
      kind: "weapon",
      ownedCount: 0,
      builtCount: 1,
      wantedCount: 0,
    }),
    {
      acquired: true,
      masteryCapable: true,
      explicitlyWanted: false,
      implicitlyWanted: true,
      requiredByGoal: false,
      wanted: true,
    },
  );
  assert.deepEqual(
    deriveCollectionState({
      kind: "arcane",
      ownedCount: 0,
      builtCount: 0,
      wantedCount: 2,
    }),
    {
      acquired: false,
      masteryCapable: false,
      explicitlyWanted: true,
      implicitlyWanted: false,
      requiredByGoal: false,
      wanted: true,
    },
  );
  assert.equal(
    deriveCollectionState({
      kind: "resource",
      ownedCount: 0,
      builtCount: 0,
      wantedCount: 0,
      goalRequiredCount: 3,
    }).requiredByGoal,
    true,
  );
});
