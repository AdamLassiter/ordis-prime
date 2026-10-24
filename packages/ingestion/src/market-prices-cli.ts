import path from "node:path";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import {
  pruneMarketPriceHistory,
  refreshMarketPriceBatch,
} from "./market-prices.ts";

const dataDirectory =
  process.env.ORDIS_DATA_DIR ??
  path.join(process.env.INIT_CWD ?? process.cwd(), "data");
const databasePath =
  process.env.ORDIS_DATABASE_URL ??
  path.join(dataDirectory, "ordis-prime.sqlite");
const batchSize = positiveInteger(
  process.env.ORDIS_MARKET_PRICE_BATCH_SIZE,
  60,
);
const requestDelayMilliseconds = positiveInteger(
  process.env.ORDIS_MARKET_PRICE_REQUEST_DELAY_MS,
  500,
);
const abortController = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => abortController.abort());

migrateDatabase(databasePath);
const database = openSqliteDatabase(databasePath);
try {
  while (!abortController.signal.aborted) {
    const result = await refreshMarketPriceBatch({
      database,
      batchSize,
      requestDelayMilliseconds,
      signal: abortController.signal,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.complete) {
      pruneMarketPriceHistory(database);
      break;
    }
  }
} finally {
  database.close();
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`Expected a positive integer, received ${value}`);
  return parsed;
}
