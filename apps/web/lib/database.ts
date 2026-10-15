import path from "node:path";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";

type SqliteDatabase = ReturnType<typeof openSqliteDatabase>;
const processGlobal = globalThis as typeof globalThis & {
  ordisDatabase?: SqliteDatabase;
};

export function getDatabase(): SqliteDatabase {
  if (processGlobal.ordisDatabase) return processGlobal.ordisDatabase;
  const dataDirectory = getDataDirectory();
  const databasePath =
    process.env.ORDIS_DATABASE_URL ??
    path.join(dataDirectory, "ordis-prime.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  processGlobal.ordisDatabase = database;
  return database;
}

export function getDataDirectory(): string {
  return (
    process.env.ORDIS_DATA_DIR ?? path.resolve(process.cwd(), "../../data")
  );
}
