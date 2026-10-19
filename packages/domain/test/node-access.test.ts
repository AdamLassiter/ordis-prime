import assert from "node:assert/strict";
import test from "node:test";
import { deriveNodeAccessStatus } from "../src/index.ts";

test("node access remains unknown without evidence", () => {
  assert.equal(deriveNodeAccessStatus({ requirementStates: [] }), "unknown");
});

test("node access composes quest progress and Mastery Rank", () => {
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: ["incomplete"],
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: ["completed"],
      masteryRequirement: 8,
      playerRank: 8,
    }),
    "available",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: ["discovered"],
      masteryRequirement: 8,
      playerRank: 8,
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: ["completed"],
      masteryRequirement: 8,
      playerRank: 7,
    }),
    "blocked",
  );
});

test("missing private progress remains conditional rather than guessed", () => {
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [undefined],
      masteryRequirement: 4,
    }),
    "conditional",
  );
});
