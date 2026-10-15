import Link from "next/link";
import { notFound } from "next/navigation";
import { getSourceRefreshMetrics, listSourceConflicts, listSourceRefreshes, listSourceStatuses } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { markConflictReviewed, reopenConflict } from "./actions";

export const dynamic = "force-dynamic";

export default async function SourceOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (session?.user.role !== "admin") notFound();
  const { id } = await params;
  const database = getDatabase();
  const source = listSourceStatuses(database).find((entry) => entry.id === id);
  if (!source) notFound();
  const refreshes = listSourceRefreshes(database, id);
  const metrics = getSourceRefreshMetrics(database, id);
  const conflicts = listSourceConflicts(database, id);
  return <>
    <p className="eyebrow">Administrator · source operations</p>
    <h1>{source.name}</h1>
    <p className="lede">Operational attempts and resolver conflicts remain separate from the active catalog. Paths below refer to retained files inside this installation.</p>
    <p className="notice">Marking a conflict reviewed records an operator decision; it does not rewrite catalog identity or replay the skipped observation.</p>
    <p><a href={source.homepage}>Upstream source</a> · <Link href="/data-sources">All sources</Link></p>

    <section className="planner-section">
      <h2>Recent refreshes</h2>
      <p className="muted">{metrics.attempts} attempts · {metrics.succeeded} succeeded · {metrics.failed} failed · {metrics.recordsProcessed.toLocaleString()} records processed{metrics.averageDurationMilliseconds === undefined ? "" : ` · ${(metrics.averageDurationMilliseconds / 1000).toFixed(2)}s average`}{metrics.recordsPerSecond === undefined ? "" : ` · ${metrics.recordsPerSecond.toFixed(1)} records/s`}</p>
      {refreshes.length ? <div className="operations">{refreshes.map((refresh) => <article className="card" key={refresh.id}>
        <span className={`tag ${refresh.status === "failed" ? "danger" : ""}`}>{refresh.status}</span>
        <p>Started {new Date(refresh.startedAt).toISOString()}{refresh.finishedAt ? ` · finished ${new Date(refresh.finishedAt).toISOString()}` : ""}</p>
        {refresh.recordsProcessed !== undefined && <p>{refresh.recordsProcessed.toLocaleString()} records{refresh.finishedAt ? ` · ${((refresh.finishedAt - refresh.startedAt) / 1000).toFixed(2)}s` : ""}{refresh.finishedAt && refresh.finishedAt > refresh.startedAt ? ` · ${(refresh.recordsProcessed * 1000 / (refresh.finishedAt - refresh.startedAt)).toFixed(1)} records/s` : ""}</p>}
        {refresh.version && <p>Version <code>{refresh.version}</code></p>}
        {refresh.snapshotPath && <p className="muted">Snapshot <code>{refresh.snapshotPath}</code></p>}
        {refresh.error && <pre className="error-block">{refresh.error}</pre>}
      </article>)}</div> : <p className="notice">No refresh has been attempted through the tracked pipeline.</p>}
    </section>

    <section className="planner-section">
      <h2>Resolver conflicts</h2>
      {conflicts.length ? <div className="operations">{conflicts.map((conflict) => <article className="card" key={conflict.id}>
        <span className="tag">{conflict.resolvedAt ? "reviewed" : "unresolved"}</span>
        <h3><code>{conflict.recordKey}</code></h3>
        <p>{conflict.reason}</p>
        <p className="muted">Source version <code>{conflict.version}</code>{conflict.snapshotPath ? <> · snapshot <code>{conflict.snapshotPath}</code></> : null}</p>
        {conflict.candidateIds.length > 0 && <p className="muted">Candidate entity IDs: {conflict.candidateIds.join(", ")}</p>}
        {conflict.reviewEvents.length > 0 && <details><summary>Review history ({conflict.reviewEvents.length})</summary><ul>{conflict.reviewEvents.map((event) => <li key={event.id}><strong>{event.action}</strong> by {event.actor} at {new Date(event.createdAt).toISOString()}: {event.note}</li>)}</ul></details>}
        {conflict.resolvedAt
          ? <form className="form-stack compact-form" action={reopenConflict.bind(null, id, conflict.id)}><label>Reason to reopen<textarea name="note" required minLength={1} maxLength={2000} rows={2} /></label><button className="nav-button">Reopen conflict</button></form>
          : <form className="form-stack compact-form" action={markConflictReviewed.bind(null, id, conflict.id)}><label>Review note<textarea name="note" required minLength={1} maxLength={2000} rows={2} placeholder="Why no catalog change is required" /></label><button className="nav-button">Mark reviewed</button></form>}
      </article>)}</div> : <p className="notice">No conflicts have been recorded for this source.</p>}
    </section>
  </>;
}
