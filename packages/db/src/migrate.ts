import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function migrateDatabase(
  databasePath = process.env.ORDIS_DATABASE_URL ??
    `${process.env.ORDIS_DATA_DIR ?? "./data"}/ordis-prime.sqlite`,
  migrationsFolder = process.env.ORDIS_MIGRATIONS_DIR ??
    path.join(packageRoot, "migrations"),
) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const releaseLock = acquireMigrationLock(databasePath);
  try {
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      sqlite.pragma("busy_timeout = 5000");
      migrate(drizzle(sqlite), { migrationsFolder });
    } finally {
      sqlite.close();
    }
  } finally {
    releaseLock();
  }
}

function acquireMigrationLock(databasePath: string): () => void {
  const lockPath = `${databasePath}.migration-lock`;
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      const descriptor = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(descriptor, `${process.pid}\n`);
      return () => {
        fs.closeSync(descriptor);
        try {
          fs.unlinkSync(lockPath);
        } catch (error) {
          if (!isFileMissing(error)) throw error;
        }
      };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      if (Date.now() >= deadline)
        throw new Error(`Timed out waiting for migration lock ${lockPath}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isFileMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  migrateDatabase();
}
