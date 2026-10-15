import Link from "next/link";
import { searchCatalog } from "@/lib/catalog";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const items = await searchCatalog(q);
  return (
    <>
      <p className="eyebrow">Linked acquisition intelligence</p>
      <h1>Know what to chase next.</h1>
      <p className="lede">
        Trace equipment through components, recipes and star-chart sources.
        Every answer retains its origin; personal progress stays yours.
      </p>
      <form>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search Warframes, weapons, mods…"
          aria-label="Search catalog"
        />
      </form>
      {items.length ? (
        <section className="grid">
          {items.map((item) => (
            <Link
              className="card"
              href={`/catalog/${item.kind}/${item.slug}`}
              key={`${item.kind}:${item.slug}`}
            >
              <span className="tag">{item.kind}</span>
              <h2>{item.name}</h2>
              {item.description && <p className="muted">{item.description}</p>}
            </Link>
          ))}
        </section>
      ) : (
        <p className="lede">
          {q
            ? "No catalog entries match this search."
            : "The catalog is empty. Run a data refresh to import source data."}
        </p>
      )}
    </>
  );
}
