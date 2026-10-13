import { listCurrentWorldState } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { WorldStateBoard } from "./world-state-board";

export const dynamic = "force-dynamic";

export default function WorldStatePage() {
  const now = Date.now();
  const windows = listCurrentWorldState(getDatabase(), now);
  const newestObservation = windows.reduce((latest, entry) => Math.max(latest, entry.observedAt), 0);
  return <>
    <p className="eyebrow">Live system intelligence</p>
    <h1>World-state timers</h1>
    <p className="lede">One view of active and upcoming cycles, events, alerts, fissures and traders. Countdown text is calculated locally from source-provided instants.</p>
    {windows.length ? <>
      <p className="freshness">Observed <time dateTime={new Date(newestObservation).toISOString()}>{formatInstant(newestObservation)}</time> via WFCD</p>
      <WorldStateBoard windows={windows} initialNow={now} />
    </> : <div className="notice empty-state">
      <p>No current world-state snapshot is available.</p>
      <p className="muted">Run <code>pnpm data:refresh wfcd-worldstate</code> to import one. Automatic polling is not implemented yet.</p>
    </div>}
  </>;
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
