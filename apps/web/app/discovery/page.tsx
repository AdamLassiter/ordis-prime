import Link from "next/link";
import { DISCOVERY_KINDS, searchDiscoveryCatalog, type DiscoveryKind } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { q = "", kind } = await searchParams;
  const selectedKind = isDiscoveryKind(kind) ? kind : undefined;
  const entries = searchDiscoveryCatalog(getDatabase(), { query: q, kind: selectedKind });
  return <>
    <p className="eyebrow">Systems and lore index</p><h1>Discovery atlas</h1>
    <p className="lede">Explore quests, enemies, bosses, mechanics and secrets in one canonical catalog. Sparse sections are visible on purpose: they show where attributed data still needs to be added.</p>
    <form className="inline-form"><label>Search<input name="q" defaultValue={q} placeholder="Search discoveries…" /></label><label>Kind<select name="kind" defaultValue={selectedKind ?? ""}><option value="">All discovery kinds</option>{DISCOVERY_KINDS.map((entry) => <option key={entry}>{entry}</option>)}</select></label><button className="button">Apply</button></form>
    <div className="filters"><Link className={!selectedKind ? "tag active" : "tag"} href={`/discovery${q ? `?q=${encodeURIComponent(q)}` : ""}`}>All</Link>{DISCOVERY_KINDS.map((entry) => <Link className={selectedKind === entry ? "tag active" : "tag"} href={`/discovery?kind=${entry}${q ? `&q=${encodeURIComponent(q)}` : ""}`} key={entry}>{entry}</Link>)}</div>
    {entries.length ? <section className="grid">{entries.map((entry) => <Link className="card discovery-card" href={`/catalog/${entry.kind}/${entry.slug}`} key={`${entry.kind}:${entry.slug}`}><span className="tag">{entry.kind}</span><h2>{entry.name}</h2>{entry.description ? <p className="muted">{entry.description}</p> : <p className="muted">No description is recorded yet.</p>}</Link>)}</section> : <p className="notice">No discovery entries match these filters. This can also mean the selected kind has no active attributed source yet.</p>}
  </>;
}

function isDiscoveryKind(value: string | undefined): value is DiscoveryKind { return (DISCOVERY_KINDS as readonly string[]).includes(value ?? ""); }
