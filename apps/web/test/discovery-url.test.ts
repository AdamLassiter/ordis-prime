import assert from "node:assert/strict";
import test from "node:test";
import { discoveryHref } from "../lib/discovery-url.ts";

test("discovery links preserve active filters while changing focus", () => {
  assert.equal(
    discoveryHref(
      { q: "Hidden system", kind: "secret", progress: "unseen" },
      "mechanic:void-flood",
    ),
    "/discovery?q=Hidden+system&kind=secret&progress=unseen&focus=mechanic%3Avoid-flood",
  );
});

test("discovery clear-focus links omit absent filters and question marks", () => {
  assert.equal(discoveryHref({}), "/discovery");
  assert.equal(discoveryHref({ kind: "quest" }), "/discovery?kind=quest");
});
