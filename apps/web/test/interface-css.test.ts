import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("the Codex lede uses the shared lede typography", () => {
  const rule = css.match(/\.hero-copy \.lede\s*\{(?<body>[^}]*)\}/u);
  assert.ok(rule?.groups?.body);
  assert.doesNotMatch(rule.groups.body, /font-size/u);
});

test("card collections render at no more than four columns", () => {
  assert.match(
    css,
    /\.layout-cards \.grid,[\s\S]*?\.layout-cards \.node-grid\s*\{\s*grid-template-columns: repeat\(4,/u,
  );
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.layout-cards \.grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u,
  );
});

test("page-level search fields consume the available filter width", async () => {
  assert.match(
    css,
    /\.search-filter-form \.search-field input\s*\{[^}]*width: 100%;[^}]*max-width: none;/u,
  );

  for (const page of [
    "../app/discovery/page.tsx",
    "../app/inventory/page.tsx",
    "../app/rankings/page.tsx",
    "../app/index/page.tsx",
  ]) {
    const source = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(source, /search-filter-form/u, page);
    assert.match(source, /className="search-field"/u, page);
  }
});
