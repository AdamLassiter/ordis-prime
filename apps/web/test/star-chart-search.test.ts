import assert from "node:assert/strict";
import test from "node:test";
import { matchesStarChartQuery } from "../lib/star-chart-search.ts";

const node = {
  name: "Fossa",
  planet: "Venus",
  missionType: "Assassination",
  faction: "Corpus",
  discoveries: [{ kind: "boss", name: "Jackal" }],
};

test("star-chart search includes node metadata and linked discoveries", () => {
  for (const query of [
    "fossa",
    "VENUS",
    "assassin",
    "corpus",
    "jackal",
    "boss",
  ])
    assert.equal(matchesStarChartQuery(node, query), true, query);
  assert.equal(matchesStarChartQuery(node, "Lephantis"), false);
  assert.equal(matchesStarChartQuery(node, "  "), true);
});
