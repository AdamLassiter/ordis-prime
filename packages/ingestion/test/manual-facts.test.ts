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
    enhancementOptions:
      - { key: critical-chance, label: Critical Chance }
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
  assert.deepEqual(observations[1]?.type === "enhancement-option" ? { key: observations[1].key, label: observations[1].label, target: observations[1].subjectExternalId } : undefined, {
    key: "critical-chance", label: "Critical Chance", target: { sourceId: "wfcd-items", namespace: "uniqueName", value: "/Lotus/Braton" },
  });
  assert.equal(observations[1]?.evidence.path, "entries[0].enhancementOptions[0]");
});

test("manual facts reject empty corrections", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-manual-facts-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "bad.yaml");
  await fs.writeFile(file, `schemaVersion: 1\nsource: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }\nentries: [{ target: { sourceId: items, namespace: id, value: one }, kind: weapon }]\n`);
  await assert.rejects(() => ManualFactsAdapter.fromFile(file), /contains no facts/);
});

test("manual facts validate canonical arcane classes", async () => {
  const valid = new TextEncoder().encode(`schemaVersion: 1
source: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }
entries: [{ target: { sourceId: items, namespace: id, value: barrier }, kind: arcane, arcaneClass: warframe }]
`);
  const adapter = ManualFactsAdapter.fromBytes(valid);
  const observations = await collect(adapter, await adapter.fetch({}));
  assert.equal(observations[0]?.type === "entity" && observations[0].fields.arcaneClass, "warframe");

  const invalid = new TextEncoder().encode(`schemaVersion: 1
source: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }
entries: [{ target: { sourceId: items, namespace: id, value: braton }, kind: weapon, arcaneClass: primary }]
`);
  assert.throws(() => ManualFactsAdapter.fromBytes(invalid), /arcaneClass is invalid/);
});

test("manual facts validate canonical weapon classes", async () => {
  const valid = new TextEncoder().encode(`schemaVersion: 1
source: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }
entries: [{ target: { sourceId: items, namespace: id, value: dread }, kind: weapon, weaponClass: bow }]
`);
  const adapter = ManualFactsAdapter.fromBytes(valid);
  const observations = await collect(adapter, await adapter.fetch({}));
  assert.equal(observations[0]?.type === "entity" && observations[0].fields.weaponClass, "bow");

  const invalid = new TextEncoder().encode(`schemaVersion: 1
source: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }
entries: [{ target: { sourceId: items, namespace: id, value: dread }, kind: weapon, weaponClass: warframe }]
`);
  assert.throws(() => ManualFactsAdapter.fromBytes(invalid), /weaponClass is invalid/);
});

test("manual facts do not imply that a retired entity can be restored", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-manual-facts-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "bad.yaml");
  await fs.writeFile(file, `schemaVersion: 1\nsource: { id: corrections, title: Corrections, url: https://example.test, licenseNote: Cited }\nentries: [{ target: { sourceId: items, namespace: id, value: one }, kind: weapon, retired: false }]\n`);
  await assert.rejects(() => ManualFactsAdapter.fromFile(file), /retired must be true/);
});

test("bundled Archon Shard effects cover normal and Tauforged variants", async () => {
  const file = new URL("../../../data/manual/archon-shard-effects.yaml", import.meta.url);
  const adapter = await ManualFactsAdapter.fromFile(file.pathname);
  const observations = await collect(adapter, await adapter.fetch({}));
  assert.equal(observations.filter(({ type }) => type === "entity").length, 12);
  assert.equal(observations.filter(({ type }) => type === "enhancement-option").length, 54);
  assert.equal(observations.some((entry) => entry.type === "enhancement-option" && entry.key === "corrosive-maximum-stacks"), true);
});
