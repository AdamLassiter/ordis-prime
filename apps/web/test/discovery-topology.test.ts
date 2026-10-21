import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscoveryTopology } from "../lib/discovery-topology.ts";

test("discovery topology positions unique cited neighbors around its focus", () => {
  const graph = buildDiscoveryTopology({
    kind: "quest",
    slug: "the-new-war",
    name: "The New War",
    relations: [
      {
        subject: {
          kind: "quest",
          slug: "the-war-within",
          name: "The War Within",
        },
      },
      {
        subject: { kind: "node", slug: "cet-cetus", name: "Cetus" },
      },
      {
        subject: { kind: "node", slug: "cet-cetus", name: "Cetus" },
      },
    ],
  });

  assert.deepEqual(
    graph.nodes.map(({ key, focused }) => ({ key, focused })),
    [
      { key: "quest:the-new-war", focused: true },
      { key: "node:cet-cetus", focused: false },
      { key: "quest:the-war-within", focused: false },
    ],
  );
  assert.deepEqual(graph.nodes[0], {
    key: "quest:the-new-war",
    kind: "quest",
    slug: "the-new-war",
    name: "The New War",
    x: 360,
    y: 220,
    focused: true,
  });
  assert.equal(graph.edges.length, 2);
  assert.equal(
    new Set(graph.nodes.map(({ x, y }) => `${x}:${y}`)).size,
    graph.nodes.length,
  );
});

test("discovery topology handles an isolated focus", () => {
  const graph = buildDiscoveryTopology({
    kind: "secret",
    slug: "isolated",
    name: "Isolated",
    relations: [],
  });
  assert.equal(graph.nodes.length, 1);
  assert.deepEqual(graph.edges, []);
});
