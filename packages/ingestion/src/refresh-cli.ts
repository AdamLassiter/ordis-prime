import path from "node:path";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import { SnapshotStore } from "./snapshot-store.ts";
import { refreshSource } from "./refresh.ts";
import { WfcdDropsAdapter } from "./adapters/wfcd-drops.ts";
import { WfcdItemsAdapter } from "./adapters/wfcd-items.ts";

const adapters = {
  "wfcd-items": () => new WfcdItemsAdapter(),
  "wfcd-drops": () => new WfcdDropsAdapter(),
} as const;

type AdapterName = keyof typeof adapters;

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(adapters);
  for (const name of names) {
    if (!(name in adapters)) throw new Error(`Unknown source ${name}. Expected one of: ${Object.keys(adapters).join(", ")}`);
  }

  const dataDirectory = process.env.ORDIS_DATA_DIR ?? "./data";
  const databasePath = process.env.ORDIS_DATABASE_URL ?? path.join(dataDirectory, "ordis-prime.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  const snapshotStore = new SnapshotStore(path.join(dataDirectory, "sources"));
  try {
    for (const name of names as AdapterName[]) {
      const result = await refreshSource({ adapter: adapters[name](), database, snapshotStore });
      process.stdout.write(`${JSON.stringify({ source: name, ...result })}\n`);
    }
  } finally {
    database.close();
  }
}

await main();
