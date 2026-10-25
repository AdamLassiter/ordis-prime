import Link from "next/link";
import { listPlayerBuilds, searchPublishedBuilds } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { addBuild } from "./actions";

export const dynamic = "force-dynamic";

export default async function BuildsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page } = await searchParams;
  const session = await getCurrentSession();
  const database = getDatabase();
  const published = searchPublishedBuilds(database, {
    query: q,
    page: positiveInteger(page),
  });
  const drafts = session ? listPlayerBuilds(database, session.user.id) : [];
  return (
    <>
      <p className="eyebrow">Builds · public versions · private drafts</p>
      <p className="lede">
        Browse published loadouts or sign in to configure complete builds with
        equipment, mods, and enhancements.
      </p>
      <form className="card index-filters search-filter-form">
        <label className="search-field">
          Search published builds
          <input
            name="q"
            defaultValue={q}
            placeholder="Title, category, or notes…"
          />
        </label>
        <button className="button">Search</button>
      </form>
      <section className="planner-section">
        <div className="section-heading">
          <h2>Published builds</h2>
          <span>{published.total.toLocaleString()} versions</span>
        </div>
        {published.entries.length ? (
          <div className="grid compact-grid preference-collection">
            {published.entries.map((build) => (
              <Link
                className="card preference-card"
                href={`/builds/shared/${build.shareKey}`}
                key={build.shareKey}
              >
                {build.category && (
                  <span className="tag">{build.category}</span>
                )}
                <h3>{build.title}</h3>
                <p className="muted">
                  Revision {build.revision} · Published{" "}
                  {formatInstant(build.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="notice">
            {q
              ? "No published builds match that search."
              : "No builds have been published yet."}
          </p>
        )}
        <PublishedPagination published={published} query={q} />
      </section>
      {session ? (
        <div className="page-workspace">
          <form className="card form-stack build-create" action={addBuild}>
            <h2>New build</h2>
            <label>
              Title
              <input
                name="title"
                maxLength={160}
                required
                placeholder="Steel Path Mesa"
              />
            </label>
            <label>
              Category
              <input
                name="category"
                maxLength={80}
                placeholder="Steel Path, farming, beginner…"
              />
            </label>
            <label>
              Notes
              <textarea name="notes" maxLength={10000} rows={4} />
            </label>
            <button className="button">Create build</button>
          </form>
          <section className="workspace-main">
            <h2>Your drafts</h2>
            {drafts.length ? (
              <div className="grid compact-grid preference-collection">
                {drafts.map((build) => (
                  <Link
                    className="card preference-card"
                    href={`/builds/${build.id}`}
                    key={build.id}
                  >
                    {build.category && (
                      <span className="tag">{build.category}</span>
                    )}
                    <h3>{build.title}</h3>
                    <p className="muted">
                      Revision {build.revision} · {build.equipment.length}{" "}
                      equipped slots
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="notice">No drafts yet.</p>
            )}
          </section>
        </div>
      ) : (
        <p className="notice">
          <Link href="/sign-in">Sign in</Link> to create and publish your own
          builds.
        </p>
      )}
    </>
  );
}

function PublishedPagination({
  published,
  query,
}: {
  published: ReturnType<typeof searchPublishedBuilds>;
  query: string;
}) {
  if (published.pageCount <= 1) return null;
  return (
    <nav className="index-pagination" aria-label="Published build pages">
      {published.page > 1 ? (
        <Link
          className="button secondary"
          href={publishedHref(query, published.page - 1)}
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {published.page} of {published.pageCount}
      </span>
      {published.page < published.pageCount ? (
        <Link
          className="button secondary"
          href={publishedHref(query, published.page + 1)}
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function publishedHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/builds?${suffix}` : "/builds";
}

function positiveInteger(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 10)} UTC`;
}
