import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanetMap } from "../lib/planet-map.ts";

test("planet maps position every node and deduplicate cited edges", () => {
  const map = buildPlanetMap([
    { slug: "a", name: "A", connections: [{ slug: "b" }] },
    { slug: "b", name: "B", connections: [{ slug: "a" }, { slug: "c" }] },
    { slug: "c", name: "C", connections: [{ slug: "b" }] },
  ]);
  assert.equal(map.nodes.length, 3);
  assert.deepEqual(map.edges, [
    { fromSlug: "a", toSlug: "b" },
    { fromSlug: "b", toSlug: "c" },
  ]);
  assert.ok(
    map.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
  );
});
