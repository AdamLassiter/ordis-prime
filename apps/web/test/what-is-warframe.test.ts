import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Codex links to the canonical What is Warframe essay", async () => {
  const [home, page, article] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/what-is-warframe/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../../WHAT-IS.md", import.meta.url), "utf8"),
  ]);

  assert.match(home, /href="\/what-is-warframe"/u);
  assert.match(page, /resolve\(process\.cwd\(\), "\.\.\/\.\.\/WHAT-IS\.md"\)/u);
  assert.match(page, /<ReactMarkdown/u);
  assert.match(page, /h1: \(\{ children \}\) =>/u);
  assert.match(page, /<h2 className="editorial-title">/u);
  assert.doesNotMatch(page, /<h1\b/u);
  assert.match(article, /^# What is Warframe, really\?/u);
});
