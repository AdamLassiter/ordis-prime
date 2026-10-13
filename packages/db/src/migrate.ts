import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function migrateDatabase(
  databasePath = process.env.ORDIS_DATABASE_URL ?? `${process.env.ORDIS_DATA_DIR ?? "./data"}/ordis-prime.sqlite`,
  migrationsFolder = path.join(packageRoot, "migrations"),
) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder });
  sqlite.close();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateDatabase();
}
