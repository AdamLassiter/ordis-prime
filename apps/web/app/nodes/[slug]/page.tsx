import Link from "next/link";
import { notFound } from "next/navigation";
import { findNode } from "@/lib/catalog";
import { getCurrentSession } from "@/lib/session";
import { getDatabase } from "@/lib/database";
import { listPlayerTodos, listWorldStateWatches } from "@ordis-prime/db";
import { addCatalogTodo, addCatalogWatch } from "@/app/todos/actions";

export default async function NodePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ needed?: string }>;
}) {
  const { slug } = await params;
  const { needed } = await searchParams;
  const session = await getCurrentSession();
  const node = await findNode(slug, session?.user.id);
  if (!node) notFound();
  const openTodo = session
    ? listPlayerTodos(getDatabase(), session.user.id).find(
        (todo) =>
          todo.status === "open" &&
          todo.entity?.kind === "node" &&
          todo.entity.slug === slug,
      )
    : undefined;
  const linkedWatch = session
    ? listWorldStateWatches(getDatabase(), session.user.id).find(
        (watch) => watch.entity?.kind === "node" && watch.entity.slug === slug,
      )
    : undefined;
  const neededOnly = session && needed === "1";
  const drops = neededOnly
    ? node.drops.filter((drop) => drop.inventory?.needed)
    : node.drops;
  return (
    <>
      <p className="eyebrow">Star chart node</p>
      <h1>{node.name}</h1>
      {node.description && <p className="lede">{node.description}</p>}
      {session && (
        <section className="card goal-editor">
          <h2>Todo</h2>
          {openTodo ? (
            <p>
              <Link href="/todos">Open task: {openTodo.title}</Link>
            </p>
          ) : (
            <form action={addCatalogTodo.bind(null, "node", slug)}>
              <button className="nav-button">Add node to my todos</button>
            </form>
          )}
        </section>
      )}
      {session && (
        <section className="card goal-editor">
          <h2>World-state watch</h2>
          {linkedWatch ? (
            <p>
              <Link href="/todos">
                Edit the linked {linkedWatch.kind} watch
              </Link>
            </p>
          ) : (
            <>
              <p className="muted">
                Create an editable watch for active Void Fissures reconciled to
                this exact node.
              </p>
              <form action={addCatalogWatch.bind(null, "node", slug)}>
                <button className="nav-button">Watch this node</button>
              </form>
            </>
          )}
        </section>
      )}
      <dl className="facts">
        <dt>Planet</dt>
        <dd>{node.planet ?? "Unknown"}</dd>
        <dt>Mission</dt>
        <dd>{node.missionType ?? "Not recorded"}</dd>
        <dt>Faction</dt>
        <dd>{node.faction ?? "Not recorded"}</dd>
        <dt>Enemy level</dt>
        <dd>
          {node.minimumEnemyLevel === undefined
            ? "Not recorded"
            : `${node.minimumEnemyLevel}–${node.maximumEnemyLevel ?? node.minimumEnemyLevel}`}
        </dd>
        <dt>Mastery requirement</dt>
        <dd>{node.masteryRequirement ?? "Not recorded"}</dd>
      </dl>
      <section>
        <h2>Connections</h2>
        {node.connections.length ? (
          <div className="filters">
            {node.connections.map((connection) => (
              <Link
                className="tag"
                href={`/nodes/${connection.slug}`}
                key={connection.slug}
              >
                {connection.name}
                {connection.planet ? `, ${connection.planet}` : ""}
              </Link>
            ))}
          </div>
        ) : (
          <p className="notice">
            No active cited navigation edges are recorded for this node.
          </p>
        )}
      </section>
      <p>
        Rewards documented for this node, joined to your private inventory when
        signed in.
      </p>
      {session ? (
        <div className="filters">
          <Link
            className={!neededOnly ? "tag active" : "tag"}
            href={`/nodes/${slug}`}
          >
            All rewards
          </Link>
          <Link
            className={neededOnly ? "tag active" : "tag"}
            href={`/nodes/${slug}?needed=1`}
          >
            Needed only
          </Link>
        </div>
      ) : (
        <p className="notice">
          <Link href="/sign-in">Sign in</Link> to show rewards you do not own or
          still want.
        </p>
      )}
      {drops.length ? (
        <section className="grid">
          {drops.map((drop, index) => (
            <Link
              className="card"
              href={`/catalog/${drop.kind}/${drop.slug}`}
              key={`${drop.kind}:${drop.slug}:${drop.rotation ?? "none"}:${index}`}
            >
              <h2>{drop.name}</h2>
              <p>
                {drop.chance === undefined
                  ? "Chance not recorded"
                  : `${(drop.chance * 100).toFixed(2)}%`}
                {drop.rotation ? ` · Rotation ${drop.rotation}` : ""}
              </p>
              {drop.inventory && (
                <p
                  className={drop.inventory.needed ? "status-needed" : "muted"}
                >
                  {inventoryLabel(drop.inventory)}
                </p>
              )}
            </Link>
          ))}
        </section>
      ) : (
        <p className="lede">
          {neededOnly
            ? "No rewards on this node are currently needed."
            : "No active drop records are linked to this node."}
        </p>
      )}
    </>
  );
}

function inventoryLabel(inventory: {
  ownedCount: number;
  builtCount: number;
  wantedCount: number;
  needed: boolean;
}) {
  if (!inventory.needed)
    return `${inventory.ownedCount} owned · ${inventory.builtCount} built`;
  if (inventory.wantedCount) return `${inventory.wantedCount} still wanted`;
  return "Not owned";
}
