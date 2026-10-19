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
