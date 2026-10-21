import {
  listCurrentWorldState,
  listWorldStateSourceStatuses,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { WorldStateBoard } from "./world-state-board";

export const dynamic = "force-dynamic";

export default function WorldStatePage() {
  const now = Date.now();
  const windows = listCurrentWorldState(getDatabase(), now);
  const sources = listWorldStateSourceStatuses(getDatabase(), now);
  const staleAfter = positiveInteger(
    process.env.ORDIS_WORLD_STATE_STALE_MS,
    15 * 60_000,
  );
  const staleSources = sources.filter(
    ({ observedAt }) => now - observedAt > staleAfter,
  );
  return (
    <>
      <p className="eyebrow">System pulse // live telemetry</p>
      <h1>
        Move before the <u>window closes.</u>
      </h1>
      <p className="lede">
        Watch cycles, events, alerts, fissures and traders from one live
        console.
      </p>
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
              ? "The current transmission contains no open windows."
              : "No live transmission has reached the Orbiter yet."}
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
