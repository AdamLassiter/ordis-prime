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
