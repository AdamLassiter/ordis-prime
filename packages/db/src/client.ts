import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.ts";

export function openSqliteDatabase(path = process.env.ORDIS_DATABASE_URL ?? `${process.env.ORDIS_DATA_DIR ?? "./data"}/ordis-prime.sqlite`) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

export function openDatabase(path?: string) {
  return drizzle(openSqliteDatabase(path), { schema });
}
