import { hostname } from "node:os";
import path from "node:path";
import { migrateDatabase, openSqliteDatabase } from "@ordis-prime/db";
import { SnapshotStore } from "./snapshot-store.ts";
import { WfcdWorldStateAdapter } from "./world-state.ts";
import { runWorkerCycle } from "./worker.ts";

const dataDirectory = process.env.ORDIS_DATA_DIR ?? path.join(process.env.INIT_CWD ?? process.cwd(), "data");
const databasePath = process.env.ORDIS_DATABASE_URL ?? path.join(dataDirectory, "ordis-prime.sqlite");
const refreshInterval = positiveInteger(process.env.ORDIS_WORLD_STATE_INTERVAL_MS, 5 * 60_000);
const retryInterval = positiveInteger(process.env.ORDIS_WORLD_STATE_RETRY_MS, 60_000);
const pollInterval = positiveInteger(process.env.ORDIS_WORKER_POLL_MS, 5_000);
const requestTimeout = positiveInteger(process.env.ORDIS_WORLD_STATE_TIMEOUT_MS, 30_000);
const owner = `${hostname()}:${process.pid}`;
const abortController = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => abortController.abort());

migrateDatabase(databasePath);
const database = openSqliteDatabase(databasePath);
const snapshotStore = new SnapshotStore(path.join(dataDirectory, "sources"));
const adapter = new WfcdWorldStateAdapter();
process.stdout.write(`${JSON.stringify({ event: "worker-started", owner, databasePath, refreshInterval })}\n`);

try {
  while (!abortController.signal.aborted) {
    const result = await runWorkerCycle({ database, snapshotStore, worldStateAdapter: adapter, owner, refreshIntervalMilliseconds: refreshInterval, retryIntervalMilliseconds: retryInterval, requestTimeoutMilliseconds: requestTimeout });
    if (result.status !== "idle") process.stdout.write(`${JSON.stringify({ event: "world-state-refresh", ...result, at: new Date().toISOString() })}\n`);
    await delay(pollInterval, abortController.signal);
  }
} finally {
  database.close();
  process.stdout.write(`${JSON.stringify({ event: "worker-stopped", owner })}\n`);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Expected a positive integer, received ${value}`);
  return parsed;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
  });
}
