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
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      railjackIntrinsicRequirement: 7,
    }),
    "conditional",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      railjackIntrinsicRequirement: 7,
      playerRailjackIntrinsicRank: 6,
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      railjackIntrinsicRequirement: 7,
      playerRailjackIntrinsicRank: 7,
    }),
    "available",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      itemRequirementStates: [undefined],
    }),
    "conditional",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      itemRequirementStates: ["blocked"],
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      itemRequirementStates: ["met"],
    }),
    "available",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      objectiveStates: [undefined],
    }),
    "conditional",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      objectiveStates: ["incomplete", "completed"],
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      objectiveStates: ["completed", "completed"],
    }),
    "available",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      activeAdversaryRequirement: "kuva-lich",
    }),
    "conditional",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      activeAdversaryRequirement: "kuva-lich",
      playerActiveAdversary: "none",
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      activeAdversaryRequirement: "kuva-lich",
      playerActiveAdversary: "sister-of-parvos",
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      activeAdversaryRequirement: "kuva-lich",
      playerActiveAdversary: "kuva-lich",
    }),
    "available",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      warframeRankRequirement: 30,
    }),
    "conditional",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      warframeRankRequirement: 30,
      playerHighestWarframeRank: 29,
    }),
    "blocked",
  );
  assert.equal(
    deriveNodeAccessStatus({
      requirementStates: [],
      warframeRankRequirement: 30,
      playerHighestWarframeRank: 30,
    }),
    "available",
  );
});
