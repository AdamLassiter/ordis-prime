import { listCurrentWorldState, listWorldStateSourceStatuses } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { WorldStateBoard } from "./world-state-board";

export const dynamic = "force-dynamic";

export default function WorldStatePage() {
  const now = Date.now();
  const windows = listCurrentWorldState(getDatabase(), now);
  const sources = listWorldStateSourceStatuses(getDatabase(), now);
  const staleAfter = positiveInteger(process.env.ORDIS_WORLD_STATE_STALE_MS, 15 * 60_000);
  const staleSources = sources.filter(({ observedAt }) => now - observedAt > staleAfter);
  return <>
    <p className="eyebrow">Live system intelligence</p>
    <h1>World-state timers</h1>
    <p className="lede">One view of active and upcoming cycles, events, alerts, fissures and traders. Countdown text is calculated locally from source-provided instants.</p>
    {sources.length > 0 && <div className={`freshness-panel${staleSources.length ? " stale" : ""}`}>
      {sources.map((source) => <p key={source.sourceId}><strong>{source.sourceName}</strong> observed <time dateTime={new Date(source.observedAt).toISOString()}>{formatInstant(source.observedAt)}</time> · {source.currentWindowCount} of {source.windowCount} windows current</p>)}
      {staleSources.length > 0 && <p className="stale-warning">Live data is older than {Math.round(staleAfter / 60_000)} minutes. Timers may be wrong while refreshes are failing.</p>}
    </div>}
    {windows.length ? <>
      <WorldStateBoard windows={windows} initialNow={now} />
    </> : <div className="notice empty-state">
      <p>{sources.length ? "The active snapshot has no unexpired windows." : "No current world-state snapshot is available."}</p>
      <p className="muted">Run <code>pnpm data:refresh wfcd-worldstate</code> to import one, or inspect Sources if the automatic worker is failing.</p>
    </div>}
  </>;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
