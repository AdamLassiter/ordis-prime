import assert from "node:assert/strict";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiFocusAdapter,
  type Snapshot,
} from "../src/index.ts";

test("wiki Focus adapter imports exactly the five schools", async () => {
  const schools = ["Madurai", "Naramon", "Unairu", "Vazarin", "Zenurik"];
  const source = `return { Schools = { ${schools
    .map(
      (name) =>
        `${name} = { Name = "${name}", Description = "${name} description", InternalName = "/Focus/${name}" }`,
    )
    .join(",")} } }`;
  const payload = {
    query: {
      pages: [
        {
          title: "Module:Focus/data",
          revisions: [{ revid: 42, slots: { main: { content: source } } }],
        },
      ],
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const snapshot: Snapshot = {
    sourceId: "warframe-wiki-focus",
    version: "fixture",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    mediaType: "application/json",
    contentHash: contentHash(bytes),
    bytes,
  };
  const observations = await collect(new WarframeWikiFocusAdapter(), snapshot);
  assert.deepEqual(
    observations.map((observation) =>
      observation.type === "entity"
        ? [observation.kind, observation.fields.name]
        : undefined,
    ),
    schools.map((name) => ["focus-school", name]),
  );
});
