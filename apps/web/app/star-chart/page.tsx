import Link from "next/link";
import { listStarChartNodes } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StarChartPage({ searchParams }: { searchParams: Promise<{ q?: string; needed?: string }> }) {
  const session = await getCurrentSession();
  const { q = "", needed } = await searchParams;
  const normalized = q.trim().toLocaleLowerCase();
  const neededOnly = Boolean(session && needed === "1");
  const nodes = listStarChartNodes(getDatabase(), session?.user.id).filter((node) => (!normalized || [node.name, node.planet, node.missionType, node.faction].some((value) => value?.toLocaleLowerCase().includes(normalized))) && (!neededOnly || (node.neededRewardCount ?? 0) > 0));
  const planets = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const planet = node.planet ?? "Unmapped";
    planets.set(planet, [...(planets.get(planet) ?? []), node]);
  }
  return <>
    <p className="eyebrow">Spatial acquisition index</p><h1>Star chart</h1>
    <p className="lede">Browse canonical mission nodes by planet and see where your collection still has gaps. This is a data-first chart; connection edges are not yet available from the imported sources.</p>
    <form className="inline-form"><label>Filter<input name="q" defaultValue={q} placeholder="Planet, node, mission, faction…" /></label>{session && <label className="check-label"><input name="needed" type="checkbox" value="1" defaultChecked={neededOnly} /> Only nodes with unowned rewards</label>}<button className="button">Apply</button></form>
    {[...planets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([planet, planetNodes]) => <section className="planet-group" key={planet}><h2>{planet}</h2><div className="node-grid">{planetNodes.map((node) => <Link className="star-node" href={`/nodes/${node.slug}`} key={node.slug}><strong>{node.name}</strong><span>{[node.missionType, node.faction].filter(Boolean).join(" · ") || "Mission details unavailable"}</span>{node.minimumEnemyLevel !== undefined && <span>Level {node.minimumEnemyLevel}–{node.maximumEnemyLevel ?? node.minimumEnemyLevel}</span>}<span>{node.rewardCount} recorded rewards{node.neededRewardCount === undefined ? "" : ` · ${node.neededRewardCount} needed`}</span></Link>)}</div></section>)}
    {!nodes.length && <p className="notice">No nodes match these filters.</p>}
  </>;
}
