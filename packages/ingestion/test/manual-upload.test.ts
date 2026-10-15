import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  collect,
  ManualDiscoveryAdapter,
  ManualFactsAdapter,
  ManualRankingAdapter,
} from "../src/index.ts";

test("manual adapters accept immutable uploaded YAML bytes", async () => {
  const cases = [
    [ManualRankingAdapter, "editorial.example.yaml"],
    [ManualDiscoveryAdapter, "discovery.example.yaml"],
    [ManualFactsAdapter, "facts.example.yaml"],
  ] as const;
  for (const [Adapter, filename] of cases) {
    const original = new Uint8Array(
      await fs.readFile(path.resolve("data/manual", filename)),
    );
    const adapter = Adapter.fromBytes(original);
    original.fill(0);
    const snapshot = await adapter.fetch({});
    assert.ok(
      snapshot.bytes.some((byte) => byte !== 0),
      `${filename} was not defensively copied`,
    );
    assert.ok(
      (await collect(adapter, snapshot)).length > 0,
      `${filename} produced no observations`,
    );
  }
});
