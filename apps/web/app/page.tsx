import Link from "next/link";
import { catalogKinds, searchCatalog } from "@/lib/catalog";

const briefings = [
  "Operator, your open tabs have achieved critical mass. I have arranged them.",
  "Navigation, Foundry, Arsenal—one console. Suspiciously efficient, is it not?",
  "The Origin System is untidy. Fortunately, Ordis has labels.",
  "Your next objective is somewhere in this data. Ordis is almost certain.",
  "All cycles observed. All blueprints indexed. Tea remains unavailable.",
  "A plan without provenance is merely a hunch wearing a waypoint.",
];

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
    body: "Follow quests, systems, bosses, abilities and secrets through a connected atlas.",
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
  const briefing = briefings[new Date().getUTCDate() % briefings.length];
  return (
    <>
      <section className="command-hero">
        <div className="hero-copy">
          <p className="eyebrow">Cephalon link // Orbiter ready</p>
          <h1>
            Bring the <u>Origin System</u> into focus.
          </h1>
          <p className="lede">
            Find the gear. Trace the farm. Watch the cycle. Keep the build. One
            living console for everything your next mission depends on.
          </p>
        </div>
        <aside className="cephalon-briefing">
          <span className="briefing-speaker">ORDIS // PRIORITY MESSAGE</span>
          <p>{briefing}</p>
          <span className="signal-line" aria-hidden="true" />
        </aside>
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
          className={!selectedKind ? "tag active" : "tag"}
          href={codexHref(q)}
        >
          All ({resultKinds.reduce((total, entry) => total + entry.count, 0)})
        </Link>
        {resultKinds.map((entry) => (
          <Link
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
              <p className="eyebrow">Codex response</p>
              <h2>
                {q ? `Matches for “${q}”` : "Catalog signal"}
                {selectedKind ? ` · ${selectedKind}` : ""}
              </h2>
            </div>
            <span>{items.length} records</span>
          </div>
          <div className="grid">
            {items.map((item) => (
              <Link
                className="card"
                href={`/catalog/${item.kind}/${item.slug}`}
                key={`${item.kind}:${item.slug}`}
              >
                <span className="tag">{item.kind}</span>
                <h2>{item.name}</h2>
                {item.description && (
                  <p className="muted">{item.description}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <p className="notice search-empty">
          {q
            ? "No Codex signal matches that query. Try a shorter designation or another spelling."
            : "The Codex is waiting for its first data transmission."}
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
