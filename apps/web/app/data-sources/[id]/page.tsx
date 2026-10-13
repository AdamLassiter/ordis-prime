import Link from "next/link";
import { notFound } from "next/navigation";
import { listSourceConflicts, listSourceRefreshes, listSourceStatuses } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SourceOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (session?.user.role !== "admin") notFound();
  const { id } = await params;
  const database = getDatabase();
  const source = listSourceStatuses(database).find((entry) => entry.id === id);
  if (!source) notFound();
  const refreshes = listSourceRefreshes(database, id);
  const conflicts = listSourceConflicts(database, id);
  return <>
    <p className="eyebrow">Administrator · source operations</p>
    <h1>{source.name}</h1>
    <p className="lede">Operational attempts and resolver conflicts remain separate from the active catalog. Paths below refer to retained files inside this installation.</p>
    <p><a href={source.homepage}>Upstream source</a> · <Link href="/data-sources">All sources</Link></p>

    <section className="planner-section">
      <h2>Recent refreshes</h2>
      {refreshes.length ? <div className="operations">{refreshes.map((refresh) => <article className="card" key={refresh.id}>
        <span className={`tag ${refresh.status === "failed" ? "danger" : ""}`}>{refresh.status}</span>
        <p>Started {new Date(refresh.startedAt).toISOString()}{refresh.finishedAt ? ` · finished ${new Date(refresh.finishedAt).toISOString()}` : ""}</p>
        {refresh.version && <p>Version <code>{refresh.version}</code></p>}
        {refresh.snapshotPath && <p className="muted">Snapshot <code>{refresh.snapshotPath}</code></p>}
        {refresh.error && <pre className="error-block">{refresh.error}</pre>}
      </article>)}</div> : <p className="notice">No refresh has been attempted through the tracked pipeline.</p>}
    </section>

    <section className="planner-section">
      <h2>Resolver conflicts</h2>
      {conflicts.length ? <div className="operations">{conflicts.map((conflict) => <article className="card" key={conflict.id}>
        <span className="tag">{conflict.resolvedAt ? "resolved" : "unresolved"}</span>
        <h3><code>{conflict.recordKey}</code></h3>
        <p>{conflict.reason}</p>
        <p className="muted">Source version <code>{conflict.version}</code>{conflict.snapshotPath ? <> · snapshot <code>{conflict.snapshotPath}</code></> : null}</p>
        {conflict.candidateIds.length > 0 && <p className="muted">Candidate entity IDs: {conflict.candidateIds.join(", ")}</p>}
      </article>)}</div> : <p className="notice">No conflicts have been recorded for this source.</p>}
    </section>
  </>;
}
