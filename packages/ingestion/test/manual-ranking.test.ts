import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { collect, ManualRankingAdapter } from "../src/index.ts";

test("manual ranking YAML retains citation context and stable WFCD links", async () => {
  const adapter = await ManualRankingAdapter.fromFile(path.resolve("data/manual/editorial.example.yaml"));
  const snapshot = await adapter.fetch({});
  const observations = await collect(adapter, snapshot);

  assert.equal(adapter.source.id, "example-video-ranking");
  assert.match(snapshot.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(observations[0]?.type, "ranking-set");
  assert.equal(observations[1]?.type, "ranking");
  if (observations[1]?.type === "ranking") {
    assert.deepEqual(observations[1].subjectExternalId, { sourceId: "wfcd-items", namespace: "uniqueName", value: "/Lotus/Weapons/Tenno/Rifle/Rifle" });
    assert.equal(observations[1].timestampSeconds, 120);
    assert.equal(observations[1].evidence.citationUrl, "https://example.invalid/video");
  }
});
