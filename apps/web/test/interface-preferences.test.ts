import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { interfacePreferenceClasses } from "../lib/interface-preferences.ts";

test("interface preference classes include layout, density, and highlighting", () => {
  assert.equal(
    interfacePreferenceClasses(),
    "layout-cards density-comfortable highlighting-badges",
  );
  assert.equal(
    interfacePreferenceClasses({
      collectionLayout: "table",
      displayDensity: "compact",
      collectionHighlighting: "emphasis",
    }),
    "layout-table density-compact highlighting-emphasis",
  );
});

test("collection-heavy pages opt into the shared layout preference", async () => {
  const pages = [
    "../app/page.tsx",
    "../app/discovery/page.tsx",
    "../app/star-chart/page.tsx",
    "../app/world-state/world-state-board.tsx",
    "../app/world-state/circuit-schedules.tsx",
    "../app/todos/page.tsx",
    "../app/rankings/page.tsx",
  ];

  for (const page of pages) {
    const source = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(source, /preference-collection/, page);
    assert.match(source, /preference-card/, page);
  }
});
