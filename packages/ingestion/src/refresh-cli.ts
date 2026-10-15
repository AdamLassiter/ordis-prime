import path from "node:path";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import { SnapshotStore } from "./snapshot-store.ts";
import { refreshSource } from "./refresh.ts";
import { WfcdDropsAdapter } from "./adapters/wfcd-drops.ts";
import { WfcdItemsAdapter } from "./adapters/wfcd-items.ts";
import { ManualRankingAdapter } from "./adapters/manual-ranking.ts";
import { ManualDiscoveryAdapter } from "./adapters/manual-discovery.ts";
import { ManualFactsAdapter } from "./adapters/manual-facts.ts";
import { refreshWorldState, WfcdWorldStateAdapter } from "./world-state.ts";

const adapters = {
  "wfcd-items": () => new WfcdItemsAdapter(),
  "wfcd-drops": () => new WfcdDropsAdapter(),
} as const;

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(adapters);
  for (const name of names) {
    if (
      !(name in adapters) &&
      name !== "wfcd-worldstate" &&
      !name.startsWith("manual-ranking:") &&
      !name.startsWith("manual-discovery:") &&
      !name.startsWith("manual-facts:")
    )
      throw new Error(
        `Unknown source ${name}. Expected ${Object.keys(adapters).join(", ")}, wfcd-worldstate, manual-ranking:<path>, manual-discovery:<path>, or manual-facts:<path>`,
      );
  }

  const dataDirectory =
    process.env.ORDIS_DATA_DIR ??
    path.join(process.env.INIT_CWD ?? process.cwd(), "data");
  const databasePath =
    process.env.ORDIS_DATABASE_URL ??
    path.join(dataDirectory, "ordis-prime.sqlite");
  migrateDatabase(databasePath);
  const database = openSqliteDatabase(databasePath);
  const snapshotStore = new SnapshotStore(path.join(dataDirectory, "sources"));
  try {
    for (const name of names) {
      if (name === "wfcd-worldstate") {
        const adapter = new WfcdWorldStateAdapter();
        const result = await refreshWorldState({
          adapter,
          database,
          snapshotStore,
        });
        process.stdout.write(
          `${JSON.stringify({ source: adapter.source.id, ...result })}\n`,
        );
        continue;
      }
      const adapter = name.startsWith("manual-ranking:")
        ? await ManualRankingAdapter.fromFile(
            path.resolve(
              process.env.INIT_CWD ?? process.cwd(),
              name.slice("manual-ranking:".length),
            ),
          )
        : name.startsWith("manual-discovery:")
          ? await ManualDiscoveryAdapter.fromFile(
              path.resolve(
                process.env.INIT_CWD ?? process.cwd(),
                name.slice("manual-discovery:".length),
              ),
            )
          : name.startsWith("manual-facts:")
            ? await ManualFactsAdapter.fromFile(
                path.resolve(
                  process.env.INIT_CWD ?? process.cwd(),
                  name.slice("manual-facts:".length),
                ),
              )
            : adapters[name as keyof typeof adapters]();
      const result = await refreshSource({ adapter, database, snapshotStore });
      process.stdout.write(
        `${JSON.stringify({ source: adapter.source.id, ...result })}\n`,
      );
    }
  } finally {
    database.close();
  }
}

await main();
