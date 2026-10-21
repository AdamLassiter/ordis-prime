import assert from "node:assert/strict";
import test from "node:test";
import { buildStarChartNeighborhood } from "../lib/star-chart-topology.ts";

test("star-chart neighborhood positions a focus and its valid direct neighbors", () => {
  const graph = buildStarChartNeighborhood(
    [
      {
        slug: "fossa",
        name: "Fossa",
        connections: [
          { slug: "venera" },
          { slug: "missing" },
          { slug: "e-gate" },
        ],
      },
      { slug: "venera", name: "Venera", connections: [] },
      { slug: "e-gate", name: "E Gate", connections: [] },
    ],
    "fossa",
  );

  assert.ok(graph);
  assert.deepEqual(
    graph.nodes.map(({ slug, focused }) => ({ slug, focused })),
    [
      { slug: "fossa", focused: true },
      { slug: "e-gate", focused: false },
      { slug: "venera", focused: false },
    ],
  );
  assert.deepEqual(graph.nodes[0], {
    slug: "fossa",
    name: "Fossa",
    x: 320,
    y: 200,
    focused: true,
  });
  assert.equal(graph.edges.length, 2);
  assert.deepEqual(
    graph.edges.map(({ toSlug }) => toSlug),
    ["e-gate", "venera"],
  );
  assert.equal(
    new Set(graph.nodes.map(({ x, y }) => `${x}:${y}`)).size,
    graph.nodes.length,
  );
});

test("star-chart neighborhood rejects an unknown focus", () => {
  assert.equal(buildStarChartNeighborhood([], "missing"), undefined);
});
