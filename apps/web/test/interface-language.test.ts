import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("primary feature labels use direct current terminology", async () => {
  const [home, alerts, build] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/todos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/builds/[id]/page.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["STAR CHART", "CYCLES", "BUILDS", "PROGRESSION"]) {
    assert.match(home, new RegExp(`code: "${label}"`, "u"));
  }
  assert.doesNotMatch(
    home,
    /code: "(?:NAVIGATION|SYSTEM PULSE|ARSENAL|ARCHIVES)"/u,
  );
  assert.match(alerts, /<h2>Alarms<\/h2>/u);
  assert.match(build, /<button className="button">Publish<\/button>/u);
  assert.doesNotMatch(build, /Publish immutable snapshot/u);
});
