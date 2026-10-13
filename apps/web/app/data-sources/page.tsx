import { listSourceStatuses } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

export default function Sources() {
  const sources = listSourceStatuses(getDatabase());
  return <>
    <p className="eyebrow">Trust and provenance</p>
    <h1>Data sources</h1>
    <p className="lede">Providers contribute evidence. They do not silently become application truth.</p>
    {sources.length
      ? <section className="grid">{sources.map((source) => <article className="card" key={source.id}>
          <h2><a href={source.homepage}>{source.name}</a></h2>
          <p>{source.version ? <>Active snapshot <code>{source.version}</code></> : "No active snapshot"}</p>
          {source.retrievedAt && <p className="muted">Retrieved {new Date(source.retrievedAt).toISOString()}</p>}
          <span className="tag">{source.license ?? "Licence not recorded"}</span>{" "}
          <span className="tag">{source.conflictCount} unresolved conflicts</span>
        </article>)}</section>
      : <p className="lede">No sources have been imported yet.</p>}
  </>;
}
