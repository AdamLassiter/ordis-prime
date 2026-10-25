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
    code: "NAVIGATION",
    title: "Plot the next run",
    body: "See what each node offers, what remains unowned, and what stands between you and launch.",
  },
  {
    href: "/world-state",
    code: "SYSTEM PULSE",
    title: "Catch the right window",
    body: "Track fissures, traders, alerts and cycles without keeping another clock open.",
  },
  {
    href: "/builds",
    code: "ARSENAL",
    title: "Keep the whole loadout",
    body: "Save equipment, modular parts, mods and enhancements as one shareable configuration.",
  },
  {
    href: "/discovery",
    code: "ARCHIVES",
    title: "Find what you missed",
    body: "Track quests, systems, bosses, abilities and secrets through a connected progression map.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { q = "", kind = "" } = await searchParams;
  const [allKinds, resultKinds] = await Promise.all([
    catalogKinds(),
    catalogKinds(q),
  ]);
  const selectedKind = allKinds.some((entry) => entry.kind === kind)
    ? kind
    : undefined;
  const items = await searchCatalog(q, selectedKind);
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
        </div>
        <CephalonBriefing message={briefing} />
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
      </section>
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
      {!q && (
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
      {items.length ? (
        <section className="search-results">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sourced catalog results</p>
              <h2>
                {q ? `Matches for “${q}”` : "Catalog records"}
                {selectedKind ? ` · ${selectedKind}` : ""}
              </h2>
            </div>
            <span>{items.length} records</span>
          </div>
          <div className="grid preference-collection">
            {items.map((item) => {
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

function codexHref(query: string, kind?: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (kind) params.set("kind", kind);
  const suffix = params.toString();
  return suffix ? `/?${suffix}` : "/";
}
