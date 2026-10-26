import Link from "next/link";
import { catalogKinds, searchCatalog } from "@/lib/catalog";
import { randomOrdisVoiceLine } from "@/lib/ordis-voice-lines";
import { getCurrentSession } from "@/lib/session";
import { getDatabase } from "@/lib/database";
import { listPlayerInventory } from "@ordis-prime/db";
import { deriveCollectionState } from "@ordis-prime/domain";
import { CollectionStateIndicators } from "@/app/collection-state-indicators";
import { CephalonBriefing } from "@/app/cephalon-briefing";

export const dynamic = "force-dynamic";

const launchCards = [
  {
    href: "/star-chart",
    code: "STAR CHART",
    title: "Explore mission routes",
    body: "See each node, its rewards, and the requirements between you and your next destination.",
  },
  {
    href: "/world-state",
    code: "CYCLES",
    title: "Track live activity",
    body: "Check fissures, traders, events, and changing cycles without keeping another clock open.",
  },
  {
    href: "/builds",
    code: "BUILDS",
    title: "Configure a loadout",
    body: "Save equipment, modular parts, mods, and enhancements as one shareable build.",
  },
  {
    href: "/discovery",
    code: "PROGRESSION",
    title: "Discover more systems",
    body: "Track quests, mechanics, bosses, abilities, and secrets through their sourced connections.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; page?: string }>;
}) {
  const { q = "", kind = "", page: pageParam } = await searchParams;
  const allKinds = await catalogKinds();
  const selectedKind = allKinds.some((entry) => entry.kind === kind)
    ? kind
    : undefined;
  const [catalog, resultKinds] = await Promise.all([
    searchCatalog({
      query: q,
      kind: selectedKind,
      page: positiveInteger(pageParam),
    }),
    catalogKinds(q),
  ]);
  const session = await getCurrentSession();
  const inventory = new Map(
    (session ? listPlayerInventory(getDatabase(), session.user.id) : []).map(
      (entry) => [`${entry.kind}:${entry.slug}`, entry] as const,
    ),
  );
  const briefing = randomOrdisVoiceLine();
  return (
    <>
      <section className="command-hero">
        <div className="hero-copy">
          <p className="eyebrow">Catalog · public sourced data</p>
          <p className="lede">
            Find equipment and resources, follow their acquisition paths, and
            open the tools that use the same linked data.
          </p>
          <Link className="editorial-link" href="/what-is-warframe">
            What is Warframe, really? <span aria-hidden="true">→</span>
          </Link>
        </div>
        <CephalonBriefing message={briefing} />
      </section>
      {!q && catalog.page === 1 && (
        <section className="launch-grid" aria-label="Orbiter consoles">
          {launchCards.map((card) => (
            <Link className="launch-card" href={card.href} key={card.href}>
              <span className="launch-code">{card.code}</span>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
              <span className="launch-link">Open console →</span>
            </Link>
          ))}
        </section>
      )}
      <form className="search-console">
        <label htmlFor="codex-query">Query the Codex</label>
        <div>
          <input
            id="codex-query"
            name="q"
            defaultValue={q}
            placeholder="Warframe, weapon, mod, resource…"
            aria-label="Search catalog"
          />
          <button className="button">Locate</button>
        </div>
        {selectedKind && (
          <input name="kind" type="hidden" value={selectedKind} />
        )}
      </form>
      <nav
        className="filters codex-kind-filters"
        aria-label="Codex record type"
      >
        <Link
          aria-current={!selectedKind ? "page" : undefined}
          className={!selectedKind ? "tag active" : "tag"}
          href={codexHref(q)}
        >
          All ({resultKinds.reduce((total, entry) => total + entry.count, 0)})
        </Link>
        {resultKinds.map((entry) => (
          <Link
            aria-current={selectedKind === entry.kind ? "page" : undefined}
            className={selectedKind === entry.kind ? "tag active" : "tag"}
            href={codexHref(q, entry.kind)}
            key={entry.kind}
          >
            {entry.kind} ({entry.count})
          </Link>
        ))}
      </nav>
      {catalog.entries.length ? (
        <section className="search-results">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sourced catalog results</p>
              <h2>
                {q ? `Matches for “${q}”` : "Catalog records"}
                {selectedKind ? ` · ${selectedKind}` : ""}
              </h2>
            </div>
            <span>{catalog.total.toLocaleString()} records</span>
          </div>
          <div className="grid preference-collection">
            {catalog.entries.map((item) => {
              const recorded = inventory.get(`${item.kind}:${item.slug}`);
              const values = recorded ?? {
                kind: item.kind,
                ownedCount: 0,
                builtCount: 0,
                wantedCount: 0,
              };
              return (
                <Link
                  className="card preference-card"
                  href={`/catalog/${item.kind}/${item.slug}`}
                  key={`${item.kind}:${item.slug}`}
                >
                  <span className="tag">{item.kind}</span>
                  <h2>{item.name}</h2>
                  {session && (
                    <CollectionStateIndicators
                      {...deriveCollectionState(values)}
                      mastered={recorded?.mastered}
                      ownedCount={recorded?.ownedCount}
                      builtCount={recorded?.builtCount}
                      wantedCount={recorded?.wantedCount}
                      compact
                    />
                  )}
                  {item.description && (
                    <p className="muted">{item.description}</p>
                  )}
                </Link>
              );
            })}
          </div>
          <CatalogPagination catalog={catalog} query={q} kind={selectedKind} />
        </section>
      ) : (
        <p className="notice search-empty">
          {q
            ? "No catalog record matches that query. Try a shorter name or another spelling."
            : "No catalog data has been imported yet."}
        </p>
      )}
    </>
  );
}

function CatalogPagination({
  catalog,
  query,
  kind,
}: {
  catalog: Awaited<ReturnType<typeof searchCatalog>>;
  query: string;
  kind?: string;
}) {
  if (catalog.pageCount <= 1) return null;
  const first = (catalog.page - 1) * catalog.pageSize + 1;
  const last = first + catalog.entries.length - 1;
  return (
    <nav className="index-pagination" aria-label="Catalog result pages">
      {catalog.page > 1 ? (
        <Link
          className="button secondary"
          href={codexHref(query, kind, catalog.page - 1)}
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        {first.toLocaleString()}–{last.toLocaleString()} of{" "}
        {catalog.total.toLocaleString()} · Page {catalog.page} of{" "}
        {catalog.pageCount}
      </span>
      {catalog.page < catalog.pageCount ? (
        <Link
          className="button secondary"
          href={codexHref(query, kind, catalog.page + 1)}
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function codexHref(query: string, kind?: string, page?: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (kind) params.set("kind", kind);
  if (page && page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/?${suffix}` : "/";
}

function positiveInteger(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
