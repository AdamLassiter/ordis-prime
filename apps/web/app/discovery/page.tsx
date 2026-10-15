import Link from "next/link";
import {
  DISCOVERY_KINDS,
  DISCOVERY_PROGRESS_STATES,
  searchDiscoveryCatalog,
  type DiscoveryKind,
  type DiscoveryProgressState,
} from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { DiscoveryProgressForm } from "./progress-form";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; progress?: string }>;
}) {
  const [{ q = "", kind, progress }, session] = await Promise.all([
    searchParams,
    getCurrentSession(),
  ]);
  const selectedKind = isDiscoveryKind(kind) ? kind : undefined;
  const selectedProgress =
    session && isDiscoveryProgress(progress) ? progress : undefined;
  const entries = searchDiscoveryCatalog(getDatabase(), {
    query: q,
    kind: selectedKind,
    progress: selectedProgress,
    userId: session?.user.id,
  });
  return (
    <>
      <p className="eyebrow">Systems and lore index</p>
      <h1><u>Discovery</u> atlas</h1>
      <p className="lede">
        Explore quests, enemies, bosses, mechanics and secrets in one canonical
        catalog. Sparse sections are visible on purpose: they show where
        attributed data still needs to be added.
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
          className={!selectedKind ? "tag active" : "tag"}
          href={discoveryHref({ q, progress: selectedProgress })}
        >
          All
        </Link>
        {DISCOVERY_KINDS.map((entry) => (
          <Link
            className={selectedKind === entry ? "tag active" : "tag"}
            href={discoveryHref({ q, kind: entry, progress: selectedProgress })}
            key={entry}
          >
            {entry}
          </Link>
        ))}
      </div>
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
                <p className="muted">No description is recorded yet.</p>
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
                        {neighbor.direction === "outgoing"
                          ? neighbor.relationKind
                          : `is ${neighbor.relationKind} by`}
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
          No discovery entries match these filters. This can also mean the
          selected kind has no active attributed source yet.
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
function discoveryHref(input: {
  q?: string;
  kind?: string;
  progress?: string;
}): string {
  const query = new URLSearchParams();
  if (input.q) query.set("q", input.q);
  if (input.kind) query.set("kind", input.kind);
  if (input.progress) query.set("progress", input.progress);
  const suffix = query.toString();
  return `/discovery${suffix ? `?${suffix}` : ""}`;
}
