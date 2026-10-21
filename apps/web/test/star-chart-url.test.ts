import assert from "node:assert/strict";
import test from "node:test";
import { starChartHref } from "../lib/star-chart-url.ts";

test("star-chart links preserve active view state while changing focus", () => {
  assert.equal(
    starChartHref(
      {
        q: "Jackal Prime",
        needed: true,
        access: "blocked",
        completion: "incomplete",
      },
      "fossa",
    ),
    "/star-chart?q=Jackal+Prime&needed=1&access=blocked&completion=incomplete&focus=fossa",
  );
});

test("star-chart clear-focus links omit absent filters and question marks", () => {
  assert.equal(starChartHref({}), "/star-chart");
  assert.equal(
    starChartHref({ access: "available" }),
    "/star-chart?access=available",
  );
});
