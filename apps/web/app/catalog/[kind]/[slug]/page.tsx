import Link from "next/link";
import { notFound } from "next/navigation";
import { findPlayerInventoryEntry } from "@ordis-prime/db";
import { findItem } from "@/lib/catalog";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { InventoryForm } from "./inventory-form";

export default async function ItemPage({ params }: { params: Promise<{ kind: string; slug: string }> }) {
  const { kind, slug } = await params;
  const item = await findItem(kind, slug);
  if (!item) notFound();
  const session = await getCurrentSession();
  const inventory = session ? findPlayerInventoryEntry(getDatabase(), session.user.id, kind, slug) : undefined;
  return <>
    <p className="eyebrow">{item.kind}</p>
    <h1>{item.name}</h1>
    {item.description && <p className="lede">{item.description}</p>}
    <dl className="facts">
      <dt>Components</dt>
      <dd>{item.components.length ? item.components.map((component) => <div key={`${component.kind}:${component.slug}`}><Link href={`/catalog/${component.kind}/${component.slug}`}>{component.quantity} × {component.name}</Link></div>) : "No crafting components recorded"}</dd>
      <dt>Acquisition</dt>
      <dd>{item.drops.length ? item.drops.map((drop, index) => <div key={`${drop.nodeSlug ?? drop.node}:${drop.rotation ?? "none"}:${index}`}>{drop.nodeSlug ? <Link href={`/nodes/${drop.nodeSlug}`}>{drop.node}</Link> : drop.node}{drop.chance === undefined ? "" : ` — ${(drop.chance * 100).toFixed(2)}%`}{drop.rotation ? `, rotation ${drop.rotation}` : ""}</div>) : "No node drop recorded"}</dd>
      <dt>Editorial rankings</dt>
      <dd>{item.rankings.length ? item.rankings.map((ranking) => <div key={`${ranking.title}:${ranking.author}`}><a href={ranking.sourceUrl}>{ranking.title}</a> by {ranking.author}: <strong>{ranking.tier}</strong>{ranking.timestampSeconds === undefined ? "" : ` at ${formatTimestamp(ranking.timestampSeconds)}`}</div>) : "No cited rankings recorded"}</dd>
      <dt>Evidence</dt>
      <dd>{item.sources.length ? item.sources.map((source) => <a className="tag" href={source.homepage} key={source.name}>{source.name}</a>) : "No active provenance recorded"}</dd>
    </dl>
    {inventory ? <InventoryForm item={inventory} /> : <p className="notice"><Link href="/sign-in">Sign in</Link> to track ownership, mastery, and wanted copies.</p>}
  </>;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
