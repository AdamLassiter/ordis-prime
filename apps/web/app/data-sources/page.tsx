import { listRecentJobs, listSourceStatuses } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import Link from "next/link";
import { queueSourceRefresh } from "./actions";

export const dynamic = "force-dynamic";

export default async function Sources() {
  const database = getDatabase();
  const sources = listSourceStatuses(database);
  const session = await getCurrentSession();
  const isAdmin = session?.user.role === "admin";
  const jobs = isAdmin ? listRecentJobs(database, 30) : [];
  return <>
    <p className="eyebrow">Trust and provenance</p>
    <h1>Data sources</h1>
    <p className="lede">Providers contribute evidence. They do not silently become application truth.</p>
    {isAdmin && <section className="card source-controls"><h2>Refresh controls</h2><p className="muted">Queue work for the leased background worker. Existing queued work is brought forward instead of duplicated.</p><div className="filters">{[["wfcd-items", "WFCD items"], ["wfcd-drops", "WFCD drops"], ["wfcd-worldstate", "World state"]].map(([id, label]) => <form action={queueSourceRefresh.bind(null, id!)} key={id}><button className="button">Queue {label}</button></form>)}</div></section>}
    {isAdmin && <section className="planner-section"><h2>Recent worker jobs</h2>{jobs.length ? <div className="operations">{jobs.map((job) => <article className="card" key={job.id}><span className={`tag ${job.status === "failed" ? "danger" : ""}`}>{job.status}</span><h3>{job.kind}</h3><p>Source <code>{typeof job.payload.source === "string" ? job.payload.source : "unknown"}</code> · due {new Date(job.runAfter).toISOString()}</p>{job.leaseOwner && <p className="muted">Lease {job.leaseOwner}{job.leaseUntil ? ` until ${new Date(job.leaseUntil).toISOString()}` : ""}</p>}{job.error && <pre className="error-block">{job.error}</pre>}</article>)}</div> : <p className="notice">No worker jobs have been recorded.</p>}</section>}
    {sources.length
      ? <section className="grid">{sources.map((source) => <article className="card" key={source.id}>
          <h2><a href={source.homepage}>{source.name}</a></h2>
          <p>{source.version ? <>Active snapshot <code>{source.version}</code></> : "No active snapshot"}</p>
          {source.retrievedAt && <p className="muted">Retrieved {new Date(source.retrievedAt).toISOString()}</p>}
          <span className="tag">{source.license ?? "Licence not recorded"}</span>{" "}
          <span className="tag">{source.conflictCount} unresolved conflicts</span>
          {source.latestRefreshStatus && <p className={source.latestRefreshStatus === "failed" ? "error" : "muted"}>Latest refresh: {source.latestRefreshStatus}{source.latestRefreshStartedAt ? ` at ${new Date(source.latestRefreshStartedAt).toISOString()}` : ""}</p>}
          {isAdmin && <p><Link className="button" href={`/data-sources/${source.id}`}>Inspect operations</Link></p>}
        </article>)}</section>
      : <p className="lede">No sources have been imported yet.</p>}
  </>;
}
