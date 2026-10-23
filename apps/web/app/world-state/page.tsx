import {
  listCurrentWorldState,
  listCyclicRewardSchedules,
  listWorldStateSourceStatuses,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { WorldStateBoard } from "./world-state-board";
import { CircuitSchedules } from "./circuit-schedules";

export const dynamic = "force-dynamic";

export default function WorldStatePage() {
  const now = Date.now();
  const database = getDatabase();
  const windows = listCurrentWorldState(database, now);
  const schedules = listCyclicRewardSchedules(database, now);
  const sources = listWorldStateSourceStatuses(database, now);
  const staleAfter = positiveInteger(
    process.env.ORDIS_WORLD_STATE_STALE_MS,
    15 * 60_000,
  );
  const staleSources = sources.filter(
    ({ observedAt }) => now - observedAt > staleAfter,
  );
  return (
    <>
      <p className="eyebrow">Public · live sourced data</p>
      <h1>Current and upcoming activity</h1>
      <p className="lede">
        Check Circuit rewards, cycles, events, alerts, fissures, and trader
        availability.
      </p>
      <CircuitSchedules schedules={schedules} />
      {sources.length > 0 && (
        <div
          className={`freshness-panel${staleSources.length ? " stale" : ""}`}
        >
          {sources.map((source) => (
            <p key={source.sourceId}>
              <strong>{source.sourceName}</strong> observed{" "}
              <time dateTime={new Date(source.observedAt).toISOString()}>
                {formatInstant(source.observedAt)}
              </time>{" "}
              · {source.currentWindowCount} of {source.windowCount} windows
              current
            </p>
          ))}
          {staleSources.length > 0 && (
            <p className="stale-warning">
              Live data is older than {Math.round(staleAfter / 60_000)} minutes.
              Timers may be wrong while refreshes are failing.
            </p>
          )}
        </div>
      )}
      {windows.length ? (
        <>
          <WorldStateBoard windows={windows} initialNow={now} />
        </>
      ) : (
        <div className="notice empty-state">
          <p>
            {sources.length
              ? "The current source data contains no open windows."
              : "No live source data is available yet."}
          </p>
          <p className="muted">
            Check Provenance for source freshness and refresh status.
          </p>
        </div>
      )}
    </>
  );
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
