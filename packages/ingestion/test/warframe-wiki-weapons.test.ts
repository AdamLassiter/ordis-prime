import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  collect,
  contentHash,
  WarframeWikiWeaponsAdapter,
  type Snapshot,
} from "../src/index.ts";

const moduleTitles = [
  "Module:Weapons/data/primary",
  "Module:Weapons/data/secondary",
  "Module:Weapons/data/melee",
  "Module:Weapons/data/archwing",
  "Module:Weapons/data/companion",
  "Module:Weapons/data/modular",
  "Module:Weapons/data/misc",
];

test("wiki weapon adapter parses literal maximum ranks without executing Lua", async () => {
  const snapshot = wikiSnapshot(`
    return {
      ["Kuva Bramma (Atmosphere)"] = {
        Link = "Kuva Bramma",
        MaxRank = 40,
        Name = "Kuva Bramma (Atmosphere)",
      },
      ["Kuva Bramma Prime"] = {
        Link = "Kuva Bramma",
        MaxRank = 40,
        Name = "Kuva Bramma Prime",
      },
      Ignored = { MaxRank = 30, Name = "Ignored", _IgnoreEntry = true },
      Future = { MaxRank = 41, Name = "Future" },
      Dynamic = { MaxRank = 30 + 0, Name = "Dynamic" },
      Missing = { Name = "Missing" },
    }
  `);

  const observations = await collect(
    new WarframeWikiWeaponsAdapter(),
    snapshot,
  );

  assert.equal(observations.length, 2);
  assert.deepEqual(observations[0], {
    type: "entity",
    kind: "weapon",
    externalIds: [
      {
        sourceId: "warframe-wiki-weapons",
        namespace: "module-record",
        value: "Module:Weapons/data/primary:Kuva Bramma (Atmosphere)",
      },
    ],
    aliases: ["Kuva Bramma"],
    fields: {
      name: "Kuva Bramma (Atmosphere)",
      slug: "kuva-bramma-atmosphere",
      equipmentMaxRank: 40,
    },
    evidence: {
      sourceId: "warframe-wiki-weapons",
      sourceRecordKey: "Module:Weapons/data/primary:Kuva Bramma (Atmosphere)",
      snapshotVersion: "fixture-1",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      citationUrl:
        "https://wiki.warframe.com/w/Module:Weapons/data/primary?oldid=10",
      license: "CC BY-NC-SA 3.0",
      path: "Module:Weapons/data/primary:3",
    },
  });
  assert.equal(
    observations[1]?.type === "entity"
      ? observations[1].fields.name
      : undefined,
    "Kuva Bramma Prime",
  );
  assert.equal(
    observations[1]?.type === "entity" ? observations[1].aliases : undefined,
    undefined,
  );
});

test("wiki weapon adapter fetches every partition and versions their revisions", async (t) => {
  const payload = wikiPayload("return {}", 100);
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    assert.equal(url.searchParams.get("action"), "query");
    assert.deepEqual(url.searchParams.get("titles")?.split("|"), moduleTitles);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert(address && typeof address !== "string");

  const snapshot = await new WarframeWikiWeaponsAdapter(
    `http://127.0.0.1:${address.port}/api.php`,
  ).fetch({});

  assert.equal(snapshot.sourceId, "warframe-wiki-weapons");
  assert.match(snapshot.version, /Module:Weapons\/data\/primary@100/);
  assert.match(snapshot.version, /warframe-wiki-weapons-v1$/);
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(snapshot.bytes)),
    payload,
  );
});

test("wiki weapon adapter rejects incomplete API responses", async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ query: { pages: [] } }),
  );
  const snapshot: Snapshot = {
    sourceId: "warframe-wiki-weapons",
    version: "fixture-1",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
  await assert.rejects(
    collect(new WarframeWikiWeaponsAdapter(), snapshot),
    /missing Module:Weapons\/data\/primary/,
  );
});

function wikiSnapshot(primarySource: string): Snapshot {
  const bytes = new TextEncoder().encode(
    JSON.stringify(wikiPayload(primarySource, 10)),
  );
  return {
    sourceId: "warframe-wiki-weapons",
    version: "fixture-1",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    contentHash: contentHash(bytes),
    mediaType: "application/json",
    bytes,
  };
}

function wikiPayload(primarySource: string, firstRevision: number) {
  return {
    query: {
      pages: moduleTitles.map((title, index) => ({
        title,
        revisions: [
          {
            revid: firstRevision + index,
            timestamp: "2026-01-01T00:00:00.000Z",
            slots: {
              main: {
                content:
                  title === "Module:Weapons/data/primary"
                    ? primarySource
                    : "return {}",
              },
            },
          },
        ],
      })),
    },
  };
}
