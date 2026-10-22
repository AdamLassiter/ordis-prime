import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { collect, ManualRankingAdapter } from "../src/index.ts";

test("manual ranking YAML retains citation context and stable WFCD links", async () => {
  const adapter = await ManualRankingAdapter.fromFile(
    path.resolve("data/manual/editorial.example.yaml"),
  );
  const snapshot = await adapter.fetch({});
  const observations = await collect(adapter, snapshot);

  assert.equal(adapter.source.id, "example-video-ranking");
  assert.match(snapshot.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(observations[0]?.type, "ranking-set");
  assert.equal(observations[1]?.type, "ranking");
  if (observations[1]?.type === "ranking") {
    assert.deepEqual(observations[1].subjectExternalId, {
      sourceId: "wfcd-items",
      namespace: "uniqueName",
      value: "/Lotus/Weapons/Tenno/Rifle/Rifle",
    });
    assert.equal(observations[1].timestampSeconds, 120);
    assert.equal(
      observations[1].evidence.citationUrl,
      "https://example.invalid/video",
    );
  }
});

const overframeFiles = [
  ["overframe-warframes.yaml", "overframe-warframes", 70],
  ["overframe-primary-weapons.yaml", "overframe-primary-weapons", 191],
  ["overframe-secondary-weapons.yaml", "overframe-secondary-weapons", 152],
  ["overframe-melee-weapons.yaml", "overframe-melee-weapons", 237],
  ["overframe-archwing.yaml", "overframe-archwing", 33],
  ["overframe-companions.yaml", "overframe-companions", 58],
] as const;

test("checked-in Overframe snapshots remain complete, cited manual rankings", async () => {
  for (const [file, sourceId, expectedRankings] of overframeFiles) {
    const adapter = await ManualRankingAdapter.fromFile(
      path.resolve("data/manual", file),
    );
    const snapshot = await adapter.fetch({});
    const observations = await collect(adapter, snapshot);
    const set = observations[0];
    const rankings = observations.slice(1);

    assert.equal(adapter.source.id, sourceId);
    assert.equal(set?.type, "ranking-set");
    assert.equal(rankings.length, expectedRankings);
    assert.match(adapter.source.homepage, /^https:\/\/web\.archive\.org\//);
    assert.ok(
      rankings.every((observation) => {
        assert.equal(observation.type, "ranking");
        if (observation.type !== "ranking") return false;
        assert.equal(observation.subjectExternalId.sourceId, "wfcd-items");
        assert.match(
          observation.notes ?? "",
          /^\d+ archived community votes; plurality tier\.$/,
        );
        return ["S", "A", "B", "C", "D"].includes(observation.tier);
      }),
    );
    const subjects = rankings.map((observation) => {
      assert.equal(observation.type, "ranking");
      return observation.type === "ranking"
        ? observation.subjectExternalId.value
        : "";
    });
    assert.equal(new Set(subjects).size, subjects.length);
  }
});

const creatorFiles = [
  ["creator-brozime-warframes-2026.yaml", 63],
  ["creator-salt-prime-coda-weapons-2025.yaml", 13],
  ["creator-salt-prime-kuva-weapons-2025.yaml", 20],
  ["creator-salt-prime-tenet-weapons-2025.yaml", 15],
  ["creator-salt-prime-primary-primes-2026.yaml", 33],
  ["creator-salt-prime-secondary-primes-2026.yaml", 29],
  ["creator-salt-prime-melee-primes-2026.yaml", 39],
] as const;

test("creator transcript conversions remain complete and use stable WFCD identities", async () => {
  for (const [file, expectedRankings] of creatorFiles) {
    const adapter = await ManualRankingAdapter.fromFile(
      path.resolve("data/manual", file),
    );
    const snapshot = await adapter.fetch({});
    const observations = await collect(adapter, snapshot);
    const rankings = observations.slice(1);

    assert.equal(observations[0]?.type, "ranking-set");
    assert.equal(rankings.length, expectedRankings);
    assert.match(
      adapter.source.homepage,
      /^https:\/\/www\.youtube\.com\/watch\?v=/,
    );
    const subjects = rankings.map((observation) => {
      assert.equal(observation.type, "ranking");
      if (observation.type !== "ranking") return "";
      assert.equal(observation.subjectExternalId.sourceId, "wfcd-items");
      return observation.subjectExternalId.value;
    });
    assert.equal(new Set(subjects).size, subjects.length);
  }
});

test("transcript conversion index accounts for every input without inventing a duplicate opinion", async () => {
  const indexPath = path.resolve(
    "data/manual/transcript-conversion-index.yaml",
  );
  const index = parse(await fs.readFile(indexPath, "utf8")) as {
    sources: Array<{
      input: string;
      output: string;
      sha256: string;
      status: string;
    }>;
  };
  const transcriptFiles = (await fs.readdir(path.resolve("data/unstructured")))
    .filter((file) => file.endsWith(".txt"))
    .sort();

  assert.deepEqual(
    index.sources.map((source) => path.basename(source.input)).sort(),
    transcriptFiles,
  );
  for (const source of index.sources) {
    const bytes = await fs.readFile(path.resolve(source.input));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      source.sha256,
    );
    await fs.access(path.resolve(source.output));
  }

  const duplicate = index.sources.find(
    (source) => source.status === "duplicate",
  );
  assert.equal(
    duplicate?.input,
    "data/unstructured/knightmareframe-warframes.txt",
  );
  assert.equal(
    duplicate?.output,
    "data/manual/creator-brozime-warframes-2026.yaml",
  );
  const [brozime, mislabeled] = await Promise.all([
    fs.readFile(
      path.resolve("data/unstructured/brozime-warframes.txt"),
      "utf8",
    ),
    fs.readFile(
      path.resolve("data/unstructured/knightmareframe-warframes.txt"),
      "utf8",
    ),
  ]);
  assert.equal(
    brozime.split("\n").slice(1).join("\n"),
    mislabeled.split("\n").slice(1).join("\n"),
  );
});
