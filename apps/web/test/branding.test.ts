import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Ordis artwork brands both browser metadata and the app header", async () => {
  const [layout, artwork] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/ordis-prime.svg", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /icon: \[\{ url: "\/ordis-prime\.svg"/);
  assert.match(layout, /className="ordis-prime-mark"/);
  assert.match(layout, /src="\/ordis-prime\.svg"/);
  assert.match(artwork, /<title id="title">Ordis Prime<\/title>/);
});
