import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fetchMediaWikiPagesSnapshot } from "../src/adapters/mediawiki-lua.ts";

test("MediaWiki pages are cached individually and reusable offline", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-wiki-cache-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    const url = new URL(request.url!, "http://localhost");
    assert.equal(url.searchParams.get("prop"), "info|pageprops|revisions");
    const titles = url.searchParams.get("titles")!.split("|");
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        query: {
          pages: titles.map((title, index) => ({
            pageid: index + 1,
            title,
            fullurl: `https://wiki.example/${title}`,
            pageprops: { displaytitle: title },
            revisions: [
              {
                revid: 100 + index,
                timestamp: "2026-01-01T00:00:00Z",
                slots: { main: { content: `page ${title}` } },
              },
            ],
          })),
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const apiUrl = `http://127.0.0.1:${address.port}/api.php`;
  const input = {
    apiUrl,
    pageTitles: ["Module:One", "Module:Two"],
    sourceId: "wiki-fixture",
    parserVersion: "parser-v1",
    cacheDirectory: root,
  } as const;

  const first = await fetchMediaWikiPagesSnapshot(input);
  assert.equal(requests, 1);
  assert.match(first.version, /mediawiki-pages-v2\|parser-v1$/);
  assert.equal((await fs.readdir(root)).length, 2);
  const second = await fetchMediaWikiPagesSnapshot({
    ...input,
    sourceId: "another-wiki-adapter",
  });
  assert.equal(requests, 1);
  assert.equal(second.contentHash, first.contentHash);
  assert.equal(second.retrievedAt, first.retrievedAt);

  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const offline = await fetchMediaWikiPagesSnapshot({
    ...input,
    cacheMaxAgeMilliseconds: 0,
  });
  assert.equal(offline.contentHash, first.contentHash);
  assert.match(offline.version, /Module:One@100/);
});
