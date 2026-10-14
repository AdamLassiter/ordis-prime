import Link from "next/link";
import { notFound } from "next/navigation";
import { DISCOVERY_KINDS, findPlayerInventoryEntry, getDiscoveryProgress, listPlayerGoals, listPlayerTodos, listWorldStateWatches } from "@ordis-prime/db";
import { findItem } from "@/lib/catalog";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { InventoryForm } from "./inventory-form";
import { GoalForm } from "@/app/planner/goal-form";
import { DiscoveryProgressForm } from "@/app/discovery/progress-form";
import { addCatalogTodo, addCatalogWatch } from "@/app/todos/actions";

export default async function ItemPage({ params }: { params: Promise<{ kind: string; slug: string }> }) {
  const { kind, slug } = await params;
  const item = await findItem(kind, slug);
  if (!item) notFound();
  const session = await getCurrentSession();
  const database = getDatabase();
  const inventory = session ? findPlayerInventoryEntry(database, session.user.id, kind, slug) : undefined;
  const goal = session ? listPlayerGoals(database, session.user.id).find((entry) => entry.entityId === inventory?.entityId) : undefined;
  const openTodo = session ? listPlayerTodos(database, session.user.id).find((todo) => todo.status === "open" && todo.entity?.kind === kind && todo.entity.slug === slug) : undefined;
  const linkedWatch = session ? listWorldStateWatches(database, session.user.id).find((watch) => watch.entity?.kind === kind && watch.entity.slug === slug) : undefined;
  const isDiscovery = (DISCOVERY_KINDS as readonly string[]).includes(kind);
  const discoveryProgress = session && isDiscovery ? getDiscoveryProgress(database, session.user.id, { kind, slug }) : undefined;
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
      <dt>Related discoveries</dt>
      <dd>{item.relations.length ? item.relations.map((relation, index) => <div key={`${relation.direction}:${relation.kind}:${relation.subject.kind}:${relation.subject.slug}:${index}`}>
        <span className="tag">{relation.direction === "outgoing" ? relation.kind : `is ${relation.kind} by`}</span>{" "}
        <Link href={`/catalog/${relation.subject.kind}/${relation.subject.slug}`}>{relation.subject.name}</Link>
        {relation.notes ? ` — ${relation.notes}` : ""} <span className="muted">({relation.citationUrl ? <a href={relation.citationUrl}>{relation.sourceName}</a> : relation.sourceName})</span>
      </div>) : "No explicit relationships recorded"}</dd>
      <dt>Evidence</dt>
      <dd>{item.evidence.length ? item.evidence.map((evidence, index) => <div className="evidence" key={`${evidence.fact}:${evidence.sourceName}:${evidence.recordKey ?? index}`}>
        <span className="tag">{evidence.fact}</span> {evidence.sourceName} <code>{evidence.version}</code>
        {evidence.recordKey && <> · record <code>{evidence.recordKey}</code></>}
        {evidence.sourcePath && <> · path <code>{evidence.sourcePath}</code></>}
        {evidence.citationUrl && <> · <a href={evidence.citationUrl}>citation</a></>}
      </div>) : "No active provenance recorded"}</dd>
    </dl>
    {discoveryProgress && <section className="card"><h2>Your discovery progress</h2><DiscoveryProgressForm kind={kind} slug={slug} state={discoveryProgress} /></section>}
    {session && <section className="card goal-editor"><h2>Todo</h2>{openTodo ? <p><Link href="/todos">Open task: {openTodo.title}</Link></p> : <form action={addCatalogTodo.bind(null, kind, slug)}><button className="nav-button">Add to my todos</button></form>}</section>}
    {session && <section className="card goal-editor"><h2>World-state watch</h2>{linkedWatch ? <p><Link href="/todos">Edit the linked {linkedWatch.kind} watch</Link></p> : <><p className="muted">Create an editable watch for active events whose label mentions this item.</p><form action={addCatalogWatch.bind(null, kind, slug)}><button className="nav-button">Watch for this item</button></form></>}</section>}
    {inventory ? <><InventoryForm item={inventory} /><section className="card goal-editor"><h2>Acquisition goal</h2><p className="muted">Set the total number you want to own or build. The planner subtracts your recorded inventory.</p><GoalForm kind={kind} slug={slug} targetQuantity={goal?.targetQuantity ?? 0} /></section></> : <p className="notice"><Link href="/sign-in">Sign in</Link> to track ownership and add acquisition goals.</p>}
  </>;
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
