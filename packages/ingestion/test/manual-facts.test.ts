import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collect } from "../src/adapter.ts";
import { ManualFactsAdapter } from "../src/adapters/manual-facts.ts";

test("manual facts target stable external IDs and retain field evidence", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-manual-facts-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "facts.yaml");
  await fs.writeFile(file, `
schemaVersion: 1
source: { id: corrections, title: Corrections, url: https://example.test/facts, licenseNote: Cited, priority: 400 }
entries:
  - target: { sourceId: wfcd-items, namespace: uniqueName, value: /Lotus/Braton }
    kind: weapon
    description: Corrected description.
    aliases: [Starter rifle]
    citationUrl: https://example.test/facts#braton
`);
  const adapter = await ManualFactsAdapter.fromFile(file);
  const snapshot = await adapter.fetch({});
  const observations = await collect(adapter, snapshot);

  assert.equal(adapter.source.priority, 400);
  assert.deepEqual(observations[0]?.type === "entity" ? observations[0].externalIds[0] : undefined, { sourceId: "wfcd-items", namespace: "uniqueName", value: "/Lotus/Braton" });
  assert.equal(observations[0]?.type === "entity" ? observations[0].fields.description : undefined, "Corrected description.");
  assert.equal(observations[0]?.evidence.citationUrl, "https://example.test/facts#braton");
  assert.equal(observations[0]?.evidence.path, "entries[0]");
});

test("manual facts reject empty corrections", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-manual-facts-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "bad.yaml");
  await fs.writeFile(file, `schemaVersion: 1\nsource: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }\nentries: [{ target: { sourceId: items, namespace: id, value: one }, kind: weapon }]\n`);
  await assert.rejects(() => ManualFactsAdapter.fromFile(file), /contains no facts/);
});

test("manual facts do not imply that a retired entity can be restored", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-manual-facts-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "bad.yaml");
  await fs.writeFile(file, `schemaVersion: 1\nsource: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }\nentries: [{ target: { sourceId: items, namespace: id, value: one }, kind: weapon, retired: false }]\n`);
  await assert.rejects(() => ManualFactsAdapter.fromFile(file), /retired must be true/);
});
