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

test("manual ranking schema requires an explicit subject namespace", () => {
  assert.throws(
    () =>
      ManualRankingAdapter.fromBytes(
        new TextEncoder().encode(`schemaVersion: 1\nsource: {}\n`),
      ),
    /schemaVersion 2/,
  );
  assert.throws(
    () =>
      ManualRankingAdapter.fromBytes(
        new TextEncoder().encode(`
schemaVersion: 2
source:
  id: invalid
  title: Invalid
  author: Invalid
  url: https://example.invalid
  publishedAt: 2026-01-01
  scope: Invalid
  licenseNote: Invalid
subject:
  sourceId: wfcd-items
scale: [S, A]
entries:
  - externalId: item
    rank: S
`),
      ),
    /subject.namespace/,
  );
});

const overframeFiles = [
  ["overframe-warframes.yaml", "overframe-warframes", 70, "wfcd-items"],
  [
    "overframe-primary-weapons.yaml",
    "overframe-primary-weapons",
    191,
    "wfcd-items",
  ],
  [
    "overframe-secondary-weapons.yaml",
    "overframe-secondary-weapons",
    152,
    "wfcd-items",
  ],
  [
    "overframe-melee-weapons.yaml",
    "overframe-melee-weapons",
    237,
    "wfcd-items",
  ],
  ["overframe-archwing.yaml", "overframe-archwing", 33, "wfcd-items"],
  ["overframe-companions.yaml", "overframe-companions", 58, "wfcd-items"],
  [
    "overframe-helminth-abilities.yaml",
    "overframe-helminth-abilities",
    36,
    "warframe-wiki-abilities",
  ],
] as const;

test("checked-in Overframe snapshots remain complete, cited manual rankings", async () => {
  for (const [
    file,
    sourceId,
    expectedRankings,
    subjectSourceId,
  ] of overframeFiles) {
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
        assert.equal(observation.subjectExternalId.sourceId, subjectSourceId);
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
  ["creator-knightmareframe-warframes-2026-average.yaml", 63],
  ["creator-knightmareframe-warframes-2026-high-investment.yaml", 63],
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
      output?: string;
      outputs?: string[];
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
    for (const output of source.outputs ??
      (source.output ? [source.output] : []))
      await fs.access(path.resolve(output));
    assert.ok(source.output || source.outputs?.length);
  }

  const knightmare = index.sources.find(
    (source) =>
      source.input === "data/unstructured/knightmareframe-warframes.txt",
  );
  assert.equal(knightmare?.status, "converted");
  assert.deepEqual(knightmare?.outputs, [
    "data/manual/creator-knightmareframe-warframes-2026-average.yaml",
    "data/manual/creator-knightmareframe-warframes-2026-high-investment.yaml",
  ]);
});

test("KnightmareFrame contexts remain independent complete rankings", async () => {
  const files = [
    "creator-knightmareframe-warframes-2026-average.yaml",
    "creator-knightmareframe-warframes-2026-high-investment.yaml",
  ];
  const sets = await Promise.all(
    files.map(async (file) => {
      const adapter = await ManualRankingAdapter.fromFile(
        path.resolve("data/manual", file),
      );
      const observations = await collect(adapter, await adapter.fetch({}));
      return observations.slice(1).map((observation) => {
        assert.equal(observation.type, "ranking");
        return observation.type === "ranking"
          ? [observation.subjectExternalId.value, observation.tier]
          : ["", ""];
      });
    }),
  );
  assert.deepEqual(
    sets[0]!.map(([subject]) => subject),
    sets[1]!.map(([subject]) => subject),
  );
  assert.notDeepEqual(sets[0], sets[1]);
});
