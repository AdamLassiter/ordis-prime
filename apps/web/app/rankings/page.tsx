import Link from "next/link";
import { compareEditorialRankings } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ q?: string; set?: string | string[] }> }) {
  const { q = "", set } = await searchParams;
  const setIds = typeof set === "string" ? [set] : set ?? [];
  const database = getDatabase();
  const available = compareEditorialRankings(database);
  const comparison = compareEditorialRankings(database, { query: q, setIds });
  return <>
    <p className="eyebrow">Cited opinions</p><h1>Tier-list comparison</h1>
    <p className="lede">Compare what each source actually said. Scales remain independent: Ordis Prime does not convert unlike tiers into a synthetic consensus score.</p>
    <form className="card form-stack ranking-filters"><label>Item<input name="q" defaultValue={q} placeholder="Filter ranked items…" /></label><fieldset><legend>Sources (none selected means all)</legend><div className="filters">{available.sets.map((rankingSet) => <label className="check-label" key={rankingSet.id}><input type="checkbox" name="set" value={rankingSet.id} defaultChecked={setIds.includes(rankingSet.id)} /> {rankingSet.title}</label>)}</div></fieldset><button className="button">Compare selected sources</button></form>
    {comparison.sets.length ? <>
      <div className="grid ranking-sources">{comparison.sets.map((set) => <article className="card" key={set.id}><h2><a href={set.citationUrl}>{set.title}</a></h2><p>{set.author}</p><p className="muted">{set.scope}{set.gameVersion ? ` · ${set.gameVersion}` : ""}</p><p>{set.scale.map((tier) => <span className="tag" key={tier}>{tier}</span>)}</p><p className="muted">Published {formatDate(set.publishedAt)}</p></article>)}</div>
      {comparison.rows.length ? <div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th>Item</th><th>Coverage</th>{comparison.sets.map((set) => <th key={set.id}>{set.title}</th>)}</tr></thead><tbody>{comparison.rows.map((row) => <tr key={`${row.entity.kind}:${row.entity.slug}`}><th><Link href={`/catalog/${row.entity.kind}/${row.entity.slug}`}>{row.entity.name}</Link></th><td>{Object.keys(row.rankings).length}/{comparison.sets.length}</td>{comparison.sets.map((set) => { const ranking = row.rankings[set.id]; return <td key={set.id}>{ranking ? <><strong>{ranking.tier}</strong>{ranking.position === undefined ? "" : ` #${ranking.position}`}{ranking.timestampSeconds === undefined ? "" : <><br /><a className="muted" href={set.citationUrl}>at {formatTimestamp(ranking.timestampSeconds)}</a></>}{ranking.notes && <p className="muted ranking-note">{ranking.notes}</p>}</> : <span className="muted">—</span>}</td>; })}</tr>)}</tbody></table></div> : <p className="notice">No ranked items match this filter.</p>}
    </> : <p className="notice">No editorial ranking sets are active. Import a cited manual ranking YAML file first.</p>}
  </>;
}

function formatDate(timestamp: number): string { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(timestamp); }
function formatTimestamp(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }
