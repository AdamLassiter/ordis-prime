import assert from "node:assert/strict";
import test from "node:test";
import { parseStarChartLayout } from "../lib/star-chart-layout.ts";

test("star-chart annotations accept normalized overview and node geometry", () => {
  const layout = parseStarChartLayout(
    JSON.stringify({
      schemaVersion: 1,
      overview: {
        planets: { Venus: { x: 0.25, y: 0.5, radius: 0.08 } },
      },
      planets: {
        Venus: { nodes: { fossa: { x: 0.4, y: 0.3 } } },
      },
    }),
  );
  assert.equal(layout.planets?.Venus?.nodes.fossa?.x, 0.4);
});

test("star-chart annotations reject pixel coordinates", () => {
  assert.throws(
    () =>
      parseStarChartLayout(
        JSON.stringify({
          schemaVersion: 1,
          overview: {
            planets: { Venus: { x: 250, y: 500, radius: 80 } },
          },
        }),
      ),
    /normalized|radius/,
  );
});
