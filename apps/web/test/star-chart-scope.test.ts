import assert from "node:assert/strict";
import test from "node:test";
import { starChartScope } from "../lib/star-chart-scope.ts";

test("star-chart locations are grouped into their top-level navigation", () => {
  assert.equal(starChartScope("Earth"), "origin");
  assert.equal(starChartScope("Höllvania"), "origin");
  assert.equal(starChartScope("Earth Proxima"), "railjack");
  assert.equal(starChartScope("Veil Proxima"), "railjack");
  assert.equal(starChartScope("Sanctuary Onslaught"), "other");
  assert.equal(starChartScope("Dark Refractory, Deimos"), "other");
  assert.equal(starChartScope("Duviri"), "other");
});
