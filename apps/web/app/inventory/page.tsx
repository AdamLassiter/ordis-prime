import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getPlayerPreferences,
  getPlayerSettings,
  listPlayerCollection,
  type CollectionFilter,
  type CollectionSort,
  type PlayerCollectionEntry,
} from "@ordis-prime/db";
import { CollectionStateIndicators } from "@/app/collection-state-indicators";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { ProfileTransfer } from "./profile-transfer";
import { updateProgression } from "./actions";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  const params = await searchParams;
  const database = getDatabase();
  const preferences = getPlayerPreferences(database, session.user.id);
  const collection = listPlayerCollection(database, session.user.id, {
    query: one(params.q),
    kind: one(params.kind),
    state: collectionFilter(one(params.state)),
    sort: collectionSort(one(params.sort)),
    direction: one(params.dir) === "desc" ? "desc" : "asc",
    page: positiveInteger(one(params.page)),
    pageSize: 60,
  });
  const settings = getPlayerSettings(database, session.user.id);
  return (
    <>
      <p className="eyebrow">Private player data</p>
      <h1>Collection and mastery</h1>
      <p className="lede">
        Browse both recorded and missing catalog items. Mastery suggestions are
        derived and never alter your explicit wanted count.
      </p>
      <section className="collection-summary" aria-label="Collection summary">
        <Summary
          label="Collection entries"
          value={collection.summary.catalogItems}
        />
        <Summary label="Acquired" value={collection.summary.acquired} />
        <Summary label="Mastered" value={collection.summary.mastered} />
        <Summary
          label="Confirmed unmastered"
          value={collection.summary.confirmedUnmastered}
        />
        <Summary
          label="Mastery unknown"
          value={collection.summary.masteryUnknown}
        />
        <Summary
          label="Explicitly wanted"
          value={collection.summary.explicitlyWanted}
        />
      </section>
      <p className="muted">
        Mastery totals count eligible catalog entries, not Mastery Rank XP: item
        XP values are not yet sourced consistently enough for an exact forecast.
      </p>
      <form className="index-filters collection-filters">
        <label>
          Search
          <input
            name="q"
            defaultValue={one(params.q)}
            placeholder="Item name"
          />
        </label>
        <label>
          Category
          <select name="kind" defaultValue={one(params.kind) ?? ""}>
            <option value="">All collection categories</option>
            {collection.kinds.map(({ kind, count }) => (
              <option value={kind} key={kind}>
                {kind} ({count})
              </option>
            ))}
          </select>
        </label>
        <label>
          State
          <select name="state" defaultValue={one(params.state) ?? "all"}>
            <option value="all">All states</option>
            <option value="acquired">Acquired</option>
            <option value="unowned">Unowned</option>
            <option value="mastered">Mastered</option>
            <option value="unmastered">Not confirmed mastered</option>
            <option value="explicit-wanted">Explicitly wanted</option>
            <option value="implicit-wanted">Suggested for mastery</option>
          </select>
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={one(params.sort) ?? "name"}>
            <option value="name">Name</option>
            <option value="kind">Category</option>
            <option value="state">Collection state</option>
          </select>
        </label>
        <label>
          Direction
          <select
            name="dir"
            defaultValue={one(params.dir) === "desc" ? "desc" : "asc"}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <button className="button">Apply</button>
      </form>
      <p className="muted">
        Showing {collection.entries.length} of {collection.total} matching
        entries. Resources and components remain excluded until their stack and
        crafting semantics are modeled.
      </p>
      {collection.entries.length ? (
        preferences.collectionLayout === "table" ? (
          <CollectionTable entries={collection.entries} />
        ) : (
          <section className="grid collection-grid">
            {collection.entries.map((entry) => (
              <CollectionCard entry={entry} key={entry.entityId} />
            ))}
          </section>
        )
      ) : (
        <p className="notice">No collection items match these filters.</p>
      )}
      <Pagination collection={collection} params={params} />
      <div className="control-deck inventory-secondary-controls">
        <section className="card">
          <h2>Progression</h2>
          <p className="muted">
            Combined rank supports documented gates. These values stay private
            and are portable with your profile.
          </p>
          <form className="form-stack compact-form" action={updateProgression}>
            <label>
              Combined Mastery Rank
              <input
                name="masteryRank"
                type="number"
                min="0"
                max="40"
                defaultValue={settings.masteryRank}
                placeholder="Not recorded"
              />
            </label>
            <label>
              Highest Railjack Intrinsic Rank
              <input
                name="railjackIntrinsicRank"
                type="number"
                min="0"
                max="10"
                defaultValue={settings.railjackIntrinsicRank}
                placeholder="Not recorded"
              />
            </label>
            <label>
              Active adversary
              <select
                name="activeAdversary"
                defaultValue={settings.activeAdversary ?? ""}
              >
                <option value="">Not recorded</option>
                <option value="none">None</option>
                <option value="kuva-lich">Kuva Lich</option>
                <option value="sister-of-parvos">Sister of Parvos</option>
                <option value="technocyte-coda">Technocyte Coda</option>
              </select>
            </label>
            <label>
              Highest available Warframe rank
              <input
                name="highestWarframeRank"
                type="number"
                min="0"
                max="30"
                defaultValue={settings.highestWarframeRank}
                placeholder="Not recorded"
              />
            </label>
            <button className="button">Save progression</button>
          </form>
        </section>
        <ProfileTransfer />
      </div>
    </>
  );
}

function CollectionCard({ entry }: { entry: PlayerCollectionEntry }) {
  return (
    <article className="card collection-card">
      <span className="tag">{entry.kind}</span>
      <h2>
        <Link href={`/catalog/${entry.kind}/${entry.slug}`}>{entry.name}</Link>
      </h2>
      <CollectionStateIndicators {...entry} />
      <p className="collection-quantities">
        {entry.ownedCount} owned · {entry.builtCount} built ·{" "}
        {entry.wantedCount} explicitly wanted
        {entry.subsumed !== undefined
          ? ` · ${entry.subsumed ? "subsumed" : "not subsumed"}`
          : ""}
      </p>
      <Acquisition entry={entry} />
      <Link
        className="text-link"
        href={`/catalog/${entry.kind}/${entry.slug}#your-inventory`}
      >
        View and edit private state →
      </Link>
    </article>
  );
}

function CollectionTable({ entries }: { entries: PlayerCollectionEntry[] }) {
  return (
    <div className="index-table-wrap">
      <table className="index-table collection-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>State</th>
            <th>Recorded quantities</th>
            <th>Acquisition links</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.entityId}>
              <td>
                <Link href={`/catalog/${entry.kind}/${entry.slug}`}>
                  {entry.name}
                </Link>
                <small>{entry.kind}</small>
              </td>
              <td>
                <CollectionStateIndicators {...entry} compact />
              </td>
              <td>
                {entry.ownedCount} owned · {entry.builtCount} built ·{" "}
                {entry.wantedCount} wanted
                {entry.subsumed !== undefined
                  ? ` · ${entry.subsumed ? "subsumed" : "not subsumed"}`
                  : ""}
              </td>
              <td>
                <Acquisition entry={entry} compact />
                <Link
                  className="text-link"
                  href={`/catalog/${entry.kind}/${entry.slug}#your-inventory`}
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Acquisition({
  entry,
  compact = false,
}: {
  entry: PlayerCollectionEntry;
  compact?: boolean;
}) {
  const paths = Object.entries(entry.acquisition)
    .filter(([, present]) => present)
    .map(([key]) => key);
  return (
    <p
      className={
        compact ? "collection-acquisition compact" : "collection-acquisition"
      }
    >
      {paths.length
        ? `Documented: ${paths.join(" · ")}.`
        : "No acquisition path is documented yet."}
      {entry.acquisition.market
        ? " Market is a trade shortcut, not the normal acquisition path."
        : ""}
    </p>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}
function Pagination({
  collection,
  params,
}: {
  collection: ReturnType<typeof listPlayerCollection>;
  params: Params;
}) {
  if (collection.pageCount <= 1) return null;
  return (
    <nav className="index-pagination" aria-label="Collection result pages">
      {collection.page > 1 ? (
        <Link
          className="button secondary"
          href={pageHref(params, collection.page - 1)}
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {collection.page} of {collection.pageCount}
      </span>
      {collection.page < collection.pageCount ? (
        <Link
          className="button secondary"
          href={pageHref(params, collection.page + 1)}
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
function pageHref(params: Params, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (key !== "page" && typeof value === "string" && value)
      next.set(key, value);
  next.set("page", String(page));
  return `/inventory?${next}`;
}
function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function positiveInteger(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
function collectionFilter(value?: string): CollectionFilter {
  return [
    "acquired",
    "unowned",
    "mastered",
    "unmastered",
    "explicit-wanted",
    "implicit-wanted",
  ].includes(value ?? "")
    ? (value as CollectionFilter)
    : "all";
}
function collectionSort(value?: string): CollectionSort {
  return value === "kind" || value === "state" ? value : "name";
}
