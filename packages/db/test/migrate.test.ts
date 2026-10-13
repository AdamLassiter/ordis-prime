import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { openSqliteDatabase } from "../src/index.ts";

const execute = promisify(execFile);

test("concurrent processes serialize migrations for one SQLite database", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ordis-migration-race-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, "catalog.sqlite");
  const migrateScript = path.resolve(import.meta.dirname, "../src/migrate.ts");
  const environment = { ...process.env, ORDIS_DATABASE_URL: databasePath };
  await Promise.all(Array.from({ length: 4 }, () => execute(process.execPath, ["--experimental-strip-types", migrateScript], { env: environment })));

  const sqlite = openSqliteDatabase(databasePath);
  context.after(() => sqlite.close());
  const migrations = sqlite.prepare("select count(*) as count from __drizzle_migrations").get() as { count: number };
  const journal = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, "../migrations/meta/_journal.json"), "utf8")) as { entries: unknown[] };
  assert.equal(migrations.count, journal.entries.length);
  assert.equal(await fs.stat(`${databasePath}.migration-lock`).then(() => true, () => false), false);
});
