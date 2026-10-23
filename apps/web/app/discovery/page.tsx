import Link from "next/link";
import {
  DISCOVERY_KINDS,
  DISCOVERY_PROGRESS_STATES,
  findCatalogItem,
  searchDiscoveryCatalog,
  type DiscoveryKind,
  type DiscoveryProgressState,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { relationLabel } from "@/lib/relation-label";
import { buildDiscoveryTopology, entityKey } from "@/lib/discovery-topology";
import { discoveryHref } from "@/lib/discovery-url";
import { DiscoveryProgressForm } from "./progress-form";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    progress?: string;
    focus?: string;
  }>;
}) {
  const [{ q = "", kind, progress, focus }, session] = await Promise.all([
    searchParams,
    getCurrentSession(),
  ]);
  const selectedKind = isDiscoveryKind(kind) ? kind : undefined;
  const selectedProgress =
    session && isDiscoveryProgress(progress) ? progress : undefined;
  const viewState = {
    q: q || undefined,
    kind: selectedKind,
    progress: selectedProgress,
  };
  const database = getDatabase();
  const entries = searchDiscoveryCatalog(database, {
    query: q,
    kind: selectedKind,
    progress: selectedProgress,
    userId: session?.user.id,
  });
  const focusIdentity = parseDiscoveryFocus(focus);
  const focusedItem = focusIdentity
    ? findCatalogItem(database, focusIdentity.kind, focusIdentity.slug)
    : undefined;
  const topology = focusedItem
    ? buildDiscoveryTopology(focusedItem)
    : undefined;
  return (
    <>
      <p className="eyebrow">Public · sourced discovery data</p>
      <h1>Explore connected discoveries</h1>
      <p className="lede">
        Search quests, abilities, enemies, mechanics, and secrets, then follow
        their cited relationships.
      </p>
      <form className="inline-form">
        <label>
          Search
          <input name="q" defaultValue={q} placeholder="Search discoveries…" />
        </label>
        <label>
          Kind
          <select name="kind" defaultValue={selectedKind ?? ""}>
            <option value="">All discovery kinds</option>
            {DISCOVERY_KINDS.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </label>
        {session && (
          <label>
            Progress
            <select name="progress" defaultValue={selectedProgress ?? ""}>
              <option value="">Any progress</option>
              {DISCOVERY_PROGRESS_STATES.map((entry) => (
                <option key={entry}>{entry}</option>
              ))}
            </select>
          </label>
        )}
        <button className="button">Apply</button>
      </form>
      <div className="filters">
        <Link
          aria-current={!selectedKind ? "page" : undefined}
          className={!selectedKind ? "tag active" : "tag"}
          href={discoveryHref({ q, progress: selectedProgress })}
        >
          All
        </Link>
        {DISCOVERY_KINDS.map((entry) => (
          <Link
            aria-current={selectedKind === entry ? "page" : undefined}
            className={selectedKind === entry ? "tag active" : "tag"}
            href={discoveryHref({ q, kind: entry, progress: selectedProgress })}
            key={entry}
          >
            {entry}
          </Link>
        ))}
      </div>
      {focus && !focusedItem && (
        <p className="notice">
          That archive focus is not available in the active catalog.
        </p>
      )}
      {focusedItem && topology && (
        <section className="card connection-explorer discovery-network">
          <p className="eyebrow">Sourced relationships</p>
          <h2>{focusedItem.name}</h2>
          <p className="muted">
            <span className="tag">{focusedItem.kind}</span>{" "}
            {focusedItem.relations.length} cited{" "}
            {focusedItem.relations.length === 1 ? "relation" : "relations"}
          </p>
          <div className="filters">
            <Link
              className="button"
              href={`/catalog/${focusedItem.kind}/${focusedItem.slug}`}
            >
              Open complete record
            </Link>
            <Link className="nav-button" href={discoveryHref(viewState)}>
              Clear focus
            </Link>
          </div>
          {topology.nodes.length > 1 ? (
            <svg
              aria-label={`Cited relations around ${focusedItem.name}`}
              className="topology-map"
              role="img"
              viewBox={`0 0 ${topology.width} ${topology.height}`}
            >
              <title>Cited relations around {focusedItem.name}</title>
              {topology.edges.map((edge) => {
                const from = topology.nodes.find(
                  ({ key }) => key === edge.fromKey,
                )!;
                const to = topology.nodes.find(
                  ({ key }) => key === edge.toKey,
                )!;
                return (
                  <line
                    className="topology-edge"
                    key={`${edge.fromKey}:${edge.toKey}`}
                    x1={from.x}
                    x2={to.x}
                    y1={from.y}
                    y2={to.y}
                  />
                );
              })}
              {topology.nodes.map((node) => (
                <a
                  aria-label={
                    node.focused
                      ? `Open ${node.name}`
                      : isDiscoveryKind(node.kind)
                        ? `Focus ${node.name}`
                        : `Open ${node.name}`
                  }
                  href={
                    node.focused
                      ? `/catalog/${node.kind}/${node.slug}`
                      : isDiscoveryKind(node.kind)
                        ? discoveryHref(viewState, node.key)
                        : entityHref(node.kind, node.slug)
                  }
                  key={node.key}
                >
                  <circle
                    className={
                      node.focused
                        ? "topology-node topology-node-focused"
                        : "topology-node"
                    }
                    cx={node.x}
                    cy={node.y}
                    r={node.focused ? 31 : 24}
                  />
                  <text
                    className="topology-kind"
                    textAnchor="middle"
                    x={node.x}
                    y={node.y + 4}
                  >
                    {node.kind}
                  </text>
                  <text
                    className="topology-label"
                    textAnchor="middle"
                    x={node.x}
                    y={node.y + (node.focused ? 49 : 41)}
                  >
                    {shortDiscoveryLabel(node.name)}
                  </text>
                </a>
              ))}
            </svg>
          ) : (
            <p className="notice">No cited links leave this record yet.</p>
          )}
          {focusedItem.relations.length > 0 && (
            <>
              <h3>Directly linked records</h3>
              <div className="connection-grid">
                {focusedItem.relations.map((relation, index) => (
                  <Link
                    className="connection-node"
                    href={
                      isDiscoveryKind(relation.subject.kind)
                        ? discoveryHref(
                            viewState,
                            entityKey(
                              relation.subject.kind,
                              relation.subject.slug,
                            ),
                          )
                        : entityHref(
                            relation.subject.kind,
                            relation.subject.slug,
                          )
                    }
                    key={`${relation.direction}:${relation.kind}:${relation.subject.kind}:${relation.subject.slug}:${relation.sourceName}:${index}`}
                  >
                    <span className="tag">
                      {relationLabel(relation.kind, relation.direction)}
                    </span>
                    <strong>{relation.subject.name}</strong>
                    <span>
                      {relation.subject.kind} · {relation.sourceName}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {entries.length ? (
        <section className="grid">
          {entries.map((entry) => (
            <article
              className="card discovery-card"
              key={`${entry.kind}:${entry.slug}`}
            >
              <span className="tag">{entry.kind}</span>
              {entry.progressState && (
                <span className={`tag progress-${entry.progressState}`}>
                  {entry.progressState}
                </span>
              )}
              <h2>
                <Link href={`/catalog/${entry.kind}/${entry.slug}`}>
                  {entry.name}
                </Link>
              </h2>
              {entry.description ? (
                <p className="muted">{entry.description}</p>
              ) : (
                <p className="muted">No briefing is available yet.</p>
              )}
              <p className="muted">
                {entry.relationCount} cited{" "}
                {entry.relationCount === 1 ? "link" : "links"}
              </p>
              {entry.neighbors.length > 0 && (
                <ul>
                  {entry.neighbors.map((neighbor) => (
                    <li
                      key={`${neighbor.direction}:${neighbor.relationKind}:${neighbor.kind}:${neighbor.slug}`}
                    >
                      <span className="tag">
                        {relationLabel(
                          neighbor.relationKind,
                          neighbor.direction,
                        )}
                      </span>{" "}
                      <Link
                        href={
                          neighbor.kind === "node"
                            ? `/nodes/${neighbor.slug}`
                            : `/catalog/${neighbor.kind}/${neighbor.slug}`
                        }
                      >
                        {neighbor.name}
                      </Link>{" "}
                      <span className="muted">
                        (
                        {neighbor.citationUrl ? (
                          <a href={neighbor.citationUrl}>
                            {neighbor.sourceName}
                          </a>
                        ) : (
                          neighbor.sourceName
                        )}
                        )
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {entry.relationCount > entry.neighbors.length && (
                <p className="muted">
                  Open the entry for{" "}
                  {entry.relationCount - entry.neighbors.length} more.
                </p>
              )}
              {entry.relationCount > 0 && (
                <Link
                  className="star-node-explore"
                  href={discoveryHref(
                    viewState,
                    entityKey(entry.kind, entry.slug),
                  )}
                >
                  Map cited links →
                </Link>
              )}
              {entry.progressState && (
                <DiscoveryProgressForm
                  kind={entry.kind}
                  slug={entry.slug}
                  state={entry.progressState}
                />
              )}
            </article>
          ))}
        </section>
      ) : (
        <p className="notice">
          No discovery entries match those filters. The selected region may not
          have verified source data yet.
        </p>
      )}
    </>
  );
}

function isDiscoveryKind(value: string | undefined): value is DiscoveryKind {
  return (DISCOVERY_KINDS as readonly string[]).includes(value ?? "");
}
function isDiscoveryProgress(
  value: string | undefined,
): value is DiscoveryProgressState {
  return (DISCOVERY_PROGRESS_STATES as readonly string[]).includes(value ?? "");
}

function parseDiscoveryFocus(
  value: string | undefined,
): { kind: DiscoveryKind; slug: string } | undefined {
  if (!value) return undefined;
  const separator = value.indexOf(":");
  if (separator < 1) return undefined;
  const kind = value.slice(0, separator);
  const slug = value.slice(separator + 1);
  return isDiscoveryKind(kind) && slug ? { kind, slug } : undefined;
}

function entityHref(kind: string, slug: string): string {
  return kind === "node" ? `/nodes/${slug}` : `/catalog/${kind}/${slug}`;
}

function shortDiscoveryLabel(name: string): string {
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}
