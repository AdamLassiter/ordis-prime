import { listSourceStatuses } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import Link from "next/link";
import { queueSourceRefresh } from "./actions";

export const dynamic = "force-dynamic";

export default async function Sources() {
  const sources = listSourceStatuses(getDatabase());
  const session = await getCurrentSession();
  const isAdmin = session?.user.role === "admin";
  return <>
    <p className="eyebrow">Trust and provenance</p>
    <h1>Data sources</h1>
    <p className="lede">Providers contribute evidence. They do not silently become application truth.</p>
    {isAdmin && <section className="card source-controls"><h2>Refresh controls</h2><p className="muted">Queue work for the leased background worker. Existing queued work is brought forward instead of duplicated.</p><div className="filters">{[["wfcd-items", "WFCD items"], ["wfcd-drops", "WFCD drops"], ["wfcd-worldstate", "World state"]].map(([id, label]) => <form action={queueSourceRefresh.bind(null, id!)} key={id}><button className="button">Queue {label}</button></form>)}</div></section>}
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
