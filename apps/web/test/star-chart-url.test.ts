import assert from "node:assert/strict";
import test from "node:test";
import { starChartHref } from "../lib/star-chart-url.ts";

test("star-chart links preserve selected detail while changing planets", () => {
  assert.equal(
    starChartHref({
      planet: "Kuva Fortress",
      show: ["events", "access"],
    }),
    "/star-chart?planet=Kuva+Fortress&show=events&show=access",
  );
});

test("star-chart overview links omit absent state and question marks", () => {
  assert.equal(starChartHref({}), "/star-chart");
  assert.equal(starChartHref({ scope: "origin" }), "/star-chart");
  assert.equal(
    starChartHref({ scope: "railjack" }),
    "/star-chart?scope=railjack",
  );
});
