import Link from "next/link";
import { DISCOVERY_KINDS, DISCOVERY_PROGRESS_STATES, searchDiscoveryCatalog, type DiscoveryKind, type DiscoveryProgressState } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { DiscoveryProgressForm } from "./progress-form";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; progress?: string }> }) {
  const [{ q = "", kind, progress }, session] = await Promise.all([searchParams, getCurrentSession()]);
  const selectedKind = isDiscoveryKind(kind) ? kind : undefined;
  const selectedProgress = session && isDiscoveryProgress(progress) ? progress : undefined;
  const entries = searchDiscoveryCatalog(getDatabase(), { query: q, kind: selectedKind, progress: selectedProgress, userId: session?.user.id });
  return <>
    <p className="eyebrow">Systems and lore index</p><h1>Discovery atlas</h1>
    <p className="lede">Explore quests, enemies, bosses, mechanics and secrets in one canonical catalog. Sparse sections are visible on purpose: they show where attributed data still needs to be added.</p>
    <form className="inline-form"><label>Search<input name="q" defaultValue={q} placeholder="Search discoveries…" /></label><label>Kind<select name="kind" defaultValue={selectedKind ?? ""}><option value="">All discovery kinds</option>{DISCOVERY_KINDS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>{session && <label>Progress<select name="progress" defaultValue={selectedProgress ?? ""}><option value="">Any progress</option>{DISCOVERY_PROGRESS_STATES.map((entry) => <option key={entry}>{entry}</option>)}</select></label>}<button className="button">Apply</button></form>
    <div className="filters"><Link className={!selectedKind ? "tag active" : "tag"} href={`/discovery${q ? `?q=${encodeURIComponent(q)}` : ""}`}>All</Link>{DISCOVERY_KINDS.map((entry) => <Link className={selectedKind === entry ? "tag active" : "tag"} href={`/discovery?kind=${entry}${q ? `&q=${encodeURIComponent(q)}` : ""}`} key={entry}>{entry}</Link>)}</div>
    {entries.length ? <section className="grid">{entries.map((entry) => <article className="card discovery-card" key={`${entry.kind}:${entry.slug}`}><span className="tag">{entry.kind}</span>{entry.progressState && <span className={`tag progress-${entry.progressState}`}>{entry.progressState}</span>}<h2><Link href={`/catalog/${entry.kind}/${entry.slug}`}>{entry.name}</Link></h2>{entry.description ? <p className="muted">{entry.description}</p> : <p className="muted">No description is recorded yet.</p>}{entry.progressState && <DiscoveryProgressForm kind={entry.kind} slug={entry.slug} state={entry.progressState} />}</article>)}</section> : <p className="notice">No discovery entries match these filters. This can also mean the selected kind has no active attributed source yet.</p>}
  </>;
}

function isDiscoveryKind(value: string | undefined): value is DiscoveryKind { return (DISCOVERY_KINDS as readonly string[]).includes(value ?? ""); }
function isDiscoveryProgress(value: string | undefined): value is DiscoveryProgressState { return (DISCOVERY_PROGRESS_STATES as readonly string[]).includes(value ?? ""); }
