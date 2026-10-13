import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collect } from "../src/adapter.ts";
import { ManualDiscoveryAdapter } from "../src/adapters/manual-discovery.ts";

test("manual discovery YAML emits cited entities and typed local or external relations", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-manual-discovery-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "discovery.yaml");
  await fs.writeFile(file, `
schemaVersion: 1
source:
  id: guide
  title: A cited guide
  url: https://example.test/guide
  licenseNote: Citation only
entries:
  - key: first-quest
    kind: quest
    name: First Quest
    slug: first-quest
  - key: hidden-room
    kind: secret
    name: Hidden Room
    slug: hidden-room
relations:
  - from: first-quest
    to: hidden-room
    kind: unlocks
  - from: hidden-room
    to: { sourceId: wfcd-items, namespace: uniqueName, value: /Lotus/Node }
    kind: occurs-at
    citationUrl: https://example.test/guide#room
`);
  const adapter = await ManualDiscoveryAdapter.fromFile(file);
  const snapshot = await adapter.fetch({});
  const observations = await collect(adapter, snapshot);

  assert.equal(adapter.source.id, "guide");
  assert.equal(observations.length, 4);
  assert.deepEqual(observations[0]?.type === "entity" ? observations[0].externalIds[0] : undefined, { sourceId: "guide", namespace: "key", value: "first-quest" });
  assert.deepEqual(observations[2]?.type === "entity-relation" ? observations[2].toExternalId : undefined, { sourceId: "guide", namespace: "key", value: "hidden-room" });
  assert.deepEqual(observations[3]?.type === "entity-relation" ? observations[3].toExternalId : undefined, { sourceId: "wfcd-items", namespace: "uniqueName", value: "/Lotus/Node" });
  assert.equal(observations[3]?.evidence.citationUrl, "https://example.test/guide#room");
});

test("manual discovery rejects undeclared local references", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-manual-discovery-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "bad.yaml");
  await fs.writeFile(file, `schemaVersion: 1\nsource: { id: guide, title: Guide, url: https://example.test, licenseNote: Citation }\nentries: [{ key: one, kind: quest, name: One, slug: one }]\nrelations: [{ from: one, to: missing, kind: requires }]\n`);
  await assert.rejects(() => ManualDiscoveryAdapter.fromFile(file), /unknown local key missing/);
});
