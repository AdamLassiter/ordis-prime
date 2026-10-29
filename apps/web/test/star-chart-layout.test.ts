import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
        Venus: {
          nodes: {
            fossa: { x: 0.4, y: 0.3, radius: 0.025 },
            "e-gate": { x: 0.6, y: 0.3 },
          },
          edges: [
            {
              from: "fossa",
              to: "e-gate",
              controls: [{ x: 0.5, y: 0.2 }],
            },
          ],
        },
      },
    }),
  );
  assert.equal(layout.planets?.Venus?.nodes.fossa?.x, 0.4);
  assert.equal(layout.planets?.Venus?.nodes.fossa?.radius, 0.025);
  assert.deepEqual(layout.planets?.Venus?.edges?.[0]?.controls, [
    { x: 0.5, y: 0.2 },
  ]);
});

test("star-chart annotations reject invalid optional node radii", () => {
  assert.throws(
    () =>
      parseStarChartLayout(
        JSON.stringify({
          schemaVersion: 1,
          planets: {
            Venus: { nodes: { fossa: { x: 0.4, y: 0.3, radius: 2 } } },
          },
        }),
      ),
    /radius/,
  );
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

test("checked-in Wiki layout covers the active reference locations", () => {
  const layout = parseStarChartLayout(
    fs.readFileSync(
      path.resolve("data/manual/star-chart-layout.json"),
      "utf8",
    ),
  );
  assert.equal(layout.sourceImages?.overview?.width, 1280);
  assert.equal(Object.keys(layout.sourceImages ?? {}).length, 26);
  assert.ok(Object.keys(layout.overview?.planets ?? {}).length >= 30);
  assert.ok(Object.keys(layout.planets ?? {}).length >= 30);
  assert.deepEqual(layout.overview?.planets["Kuva Fortress"], {
    x: 0.705,
    y: 0.685,
    radius: 0.014,
  });
  assert.deepEqual(layout.planets?.Mercury?.nodes.tolstoj, {
    x: 0.252083,
    y: 0.158333,
    radius: 0.006,
  });
  assert.equal(layout.planets?.Mercury?.nodes["mercury-caduceus"]?.y, 0.965);
});

test("star-chart annotations reject invalid source image dimensions", () => {
  assert.throws(
    () =>
      parseStarChartLayout(
        JSON.stringify({
          schemaVersion: 1,
          sourceImages: {
            overview: { name: "overview.jpg", width: 0, height: 720 },
          },
        }),
      ),
    /source image overview/,
  );
});
