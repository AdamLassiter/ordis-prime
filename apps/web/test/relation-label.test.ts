import assert from "node:assert/strict";
import test from "node:test";
import { relationLabel } from "../lib/relation-label.ts";

test("relation labels make directed quest sequences readable from both ends", () => {
  assert.equal(relationLabel("follows", "outgoing"), "follows");
  assert.equal(relationLabel("follows", "incoming"), "followed by");
});

test("relation labels render symmetric star-chart connections without syntax artifacts", () => {
  assert.equal(relationLabel("connects-to", "outgoing"), "connects to");
  assert.equal(relationLabel("connects-to", "incoming"), "connects to");
});

test("relation labels make incoming access requirements readable", () => {
  assert.equal(relationLabel("requires", "outgoing"), "requires");
  assert.equal(relationLabel("requires", "incoming"), "required by");
});

test("relation labels describe ability augment links from either endpoint", () => {
  assert.equal(relationLabel("augments", "outgoing"), "augments");
  assert.equal(relationLabel("augments", "incoming"), "augmented by");
});
