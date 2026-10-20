import Link from "next/link";
import { notFound } from "next/navigation";
import { findNode } from "@/lib/catalog";
import { getCurrentSession } from "@/lib/session";
import { getDatabase } from "@/lib/database";
import {
  getPlayerSettings,
  listPlayerTodos,
  listWorldStateWatches,
} from "@ordis-prime/db";
import { addCatalogTodo, addCatalogWatch } from "@/app/todos/actions";
import { relationLabel } from "@/lib/relation-label";
import { ADVERSARY_LABELS } from "@ordis-prime/domain";
import { NodeCompletionForm } from "../completion-form";

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
  const database = getDatabase();
  const node = await findNode(slug, session?.user.id);
  if (!node) notFound();
  const settings = session
    ? getPlayerSettings(database, session.user.id)
    : undefined;
  const openTodo = session
    ? listPlayerTodos(database, session.user.id).find(
        (todo) =>
          todo.status === "open" &&
          todo.entity?.kind === "node" &&
          todo.entity.slug === slug,
      )
    : undefined;
  const linkedWatch = session
    ? listWorldStateWatches(database, session.user.id).find(
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
      {session && node.completionState && (
        <section className="card goal-editor">
          <h2>Node completion</h2>
          <p className="muted">
            Track whether you have cleared this node. This private state is
            independent of catalog access evidence.
          </p>
          <NodeCompletionForm slug={slug} state={node.completionState} />
        </section>
      )}
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
        <dd>
          {node.masteryRequirement ?? "Not recorded"}
          {node.masteryRequirement !== undefined && settings && (
            <span
              className={
                settings.masteryRank !== undefined &&
                settings.masteryRank >= node.masteryRequirement
                  ? "tag progress-completed"
                  : "tag status-needed"
              }
            >
              {settings.masteryRank === undefined
                ? "player rank not recorded"
                : settings.masteryRank >= node.masteryRequirement
                  ? "met"
                  : `blocked at ${settings.masteryRank}`}
            </span>
          )}
        </dd>
        <dt>Railjack Intrinsic requirement</dt>
        <dd>
          {node.railjackIntrinsicRequirement ?? "Not recorded"}
          {node.railjackIntrinsicRequirement !== undefined && settings && (
            <span
              className={
                settings.railjackIntrinsicRank !== undefined &&
                settings.railjackIntrinsicRank >=
                  node.railjackIntrinsicRequirement
                  ? "tag progress-completed"
                  : "tag status-needed"
              }
            >
              {settings.railjackIntrinsicRank === undefined
                ? "highest player rank not recorded"
                : settings.railjackIntrinsicRank >=
                    node.railjackIntrinsicRequirement
                  ? "met"
                  : `blocked at ${settings.railjackIntrinsicRank}`}
            </span>
          )}
        </dd>
        <dt>Active adversary requirement</dt>
        <dd>
          {node.activeAdversaryRequirement
            ? ADVERSARY_LABELS[node.activeAdversaryRequirement]
            : "Not recorded"}
          {node.activeAdversaryRequirement && settings && (
            <span
              className={
                settings.activeAdversary === node.activeAdversaryRequirement
                  ? "tag progress-completed"
                  : "tag status-needed"
              }
            >
              {settings.activeAdversary === undefined
                ? "player adversary not recorded"
                : settings.activeAdversary === node.activeAdversaryRequirement
                  ? "met"
                  : settings.activeAdversary === "none"
                    ? "blocked with no active adversary"
                    : `blocked with ${ADVERSARY_LABELS[settings.activeAdversary]}`}
            </span>
          )}
        </dd>
      </dl>
      <section>
        <h2>Access requirements</h2>
        {node.itemRequirements.length > 0 && (
          <ul>
            {node.itemRequirements.map((requirement) => (
              <li
                key={`item:${requirement.kind}:${requirement.slug}:${requirement.sourceName}`}
              >
                Requires {requirement.requiredCount} ×{" "}
                <Link href={`/catalog/${requirement.kind}/${requirement.slug}`}>
                  {requirement.name}
                </Link>{" "}
                {requirement.state && (
                  <span
                    className={
                      requirement.state === "met"
                        ? "tag progress-completed"
                        : "tag status-needed"
                    }
                  >
                    {requirement.state === "met"
                      ? `met (${requirement.ownedCount} owned)`
                      : `blocked (${requirement.ownedCount} owned)`}
                  </span>
                )}{" "}
                <span className="muted">
                  (
                  {requirement.citationUrl ? (
                    <a href={requirement.citationUrl}>
                      {requirement.sourceName}
                    </a>
                  ) : (
                    requirement.sourceName
                  )}
                  )
                </span>
              </li>
            ))}
          </ul>
        )}
        {node.accessRequirements.length ? (
          <ul>
            {node.accessRequirements.map((requirement) => (
              <li
                key={`${requirement.relationKind}:${requirement.kind}:${requirement.slug}:${requirement.sourceName}`}
              >
                <span className="tag">
                  {relationLabel(
                    requirement.relationKind,
                    requirement.relationKind === "requires"
                      ? "outgoing"
                      : "incoming",
                  )}
                </span>{" "}
                <Link
                  href={
                    requirement.kind === "node"
                      ? `/nodes/${requirement.slug}`
                      : `/catalog/${requirement.kind}/${requirement.slug}`
                  }
                >
                  {requirement.name}
                </Link>{" "}
                {requirement.progressState && (
                  <span className={`tag progress-${requirement.progressState}`}>
                    {requirement.progressState}
                  </span>
                )}{" "}
                <span className="muted">
                  (
                  {requirement.citationUrl ? (
                    <a href={requirement.citationUrl}>
                      {requirement.sourceName}
                    </a>
                  ) : (
                    requirement.sourceName
                  )}
                  )
                </span>
              </li>
            ))}
          </ul>
        ) : node.itemRequirements.length === 0 ? (
          <p className="notice">
            No complete, structured access requirement is recorded for this
            node.
          </p>
        ) : null}
      </section>
      <section>
        <h2>Connections</h2>
        {node.connections.length > 0 && (
          <p>
            <Link href={`/star-chart?focus=${encodeURIComponent(node.slug)}`}>
              Explore this node in the connection graph →
            </Link>
          </p>
        )}
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
