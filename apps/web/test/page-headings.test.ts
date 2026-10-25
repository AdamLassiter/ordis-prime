import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../app/", import.meta.url));

test("application pages do not render redundant h1 title banners", async () => {
  const entries = await readdir(appRoot, { recursive: true });
  const pageFiles = entries.filter((entry) => entry.endsWith("page.tsx"));
  const offenders: string[] = [];

  for (const pageFile of pageFiles) {
    const source = await readFile(path.join(appRoot, pageFile), "utf8");
    if (/<\/?h1\b/i.test(source)) offenders.push(pageFile);
  }

  assert.deepEqual(offenders, []);
});
