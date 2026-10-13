import Link from "next/link";
import { notFound } from "next/navigation";
import { findNode } from "@/lib/catalog";

export default async function NodePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const node = await findNode(slug);
  if (!node) notFound();
  return <>
    <p className="eyebrow">Star chart node</p>
    <h1>{node.name}</h1>
    {node.description && <p className="lede">{node.description}</p>}
    <p>Rewards documented for this node. Account overlays will add “needed only” filtering.</p>
    {node.drops.length
      ? <section className="grid">{node.drops.map((drop, index) => <Link className="card" href={`/catalog/${drop.kind}/${drop.slug}`} key={`${drop.kind}:${drop.slug}:${drop.rotation ?? "none"}:${index}`}><h2>{drop.name}</h2><p>{drop.chance === undefined ? "Chance not recorded" : `${(drop.chance * 100).toFixed(2)}%`}{drop.rotation ? ` · Rotation ${drop.rotation}` : ""}</p></Link>)}</section>
      : <p className="lede">No active drop records are linked to this node.</p>}
  </>;
}
