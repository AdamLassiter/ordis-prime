import assert from "node:assert/strict";
import test from "node:test";
import { isNavigationActive } from "../lib/navigation.ts";

test("the catalog link is active only on the catalog root", () => {
  assert.equal(isNavigationActive("/", "/"), true);
  assert.equal(isNavigationActive("/discovery", "/"), false);
});

test("a section link remains active on its detail pages", () => {
  assert.equal(isNavigationActive("/builds", "/builds"), true);
  assert.equal(isNavigationActive("/builds/123", "/builds"), true);
  assert.equal(isNavigationActive("/buildsmith", "/builds"), false);
});
