import Link from "next/link";
import { compareEditorialRankings } from "@ordis-prime/db";
import { getDatabase } from "@/lib/database";

export const dynamic = "force-dynamic";

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    set?: string | string[];
    summary?: string;
    sort?: string;
  }>;
}) {
  const { q = "", set, summary, sort } = await searchParams;
  const setIds = typeof set === "string" ? [set] : (set ?? []);
  const showSummary = summary === "yes";
  const database = getDatabase();
  const available = compareEditorialRankings(database, { limit: 1 });
  const comparison = compareEditorialRankings(database, {
    query: q,
    setIds,
    limit: 1_000,
  });
  const sortMode = sort === "tier" ? "tier" : "name";
  const rows = [...comparison.rows].sort((left, right) =>
    sortMode === "tier"
      ? compareByTier(left, right, comparison.sets)
      : left.entity.name.localeCompare(right.entity.name),
  );
  const isolatedSet =
    setIds.length === 1 && comparison.sets.length === 1
      ? comparison.sets[0]
      : undefined;
  return (
    <>
      <p className="eyebrow">Tier Lists · public cited editorial data</p>
      <p className="lede">
        Compare tier lists side by side without flattening away their different
        scales, scopes or source notes.
      </p>
      <form className="card form-stack ranking-filters">
        <label>
          Item
          <input name="q" defaultValue={q} placeholder="Filter ranked items…" />
        </label>
        <fieldset>
          <legend>Sources (none selected means all)</legend>
          <div className="filters">
            {available.sets.map((rankingSet) => (
              <label className="check-label" key={rankingSet.id}>
                <input
                  type="checkbox"
                  name="set"
                  value={rankingSet.id}
                  defaultChecked={setIds.includes(rankingSet.id)}
                />{" "}
                {rankingSet.title}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check-label">
          <input
            type="checkbox"
            name="summary"
            value="yes"
            defaultChecked={showSummary}
          />{" "}
          Show derived ordinal summary
        </label>
        <label>
          Sort items
          <select name="sort" defaultValue={sortMode}>
            <option value="name">Name</option>
            <option value="tier">Tier (best first)</option>
          </select>
        </label>
        <button className="button">Compare selected sources</button>
      </form>
      {comparison.sets.length ? (
        <>
          <div className="grid ranking-sources">
            {comparison.sets.map((set) => (
              <article className="card" key={set.id}>
                <h2>
                  <Link
                    href={`/rankings?set=${encodeURIComponent(set.id)}&sort=tier`}
                  >
                    {set.title}
                  </Link>
                </h2>
                <p>{set.author}</p>
                <p className="muted">
                  {set.scope}
                  {set.gameVersion ? ` · ${set.gameVersion}` : ""}
                </p>
                <p>
                  {set.scale.map((tier) => (
                    <span className="tag" key={tier}>
                      {tier}
                    </span>
                  ))}
                </p>
                <p className="muted">Published {formatDate(set.publishedAt)}</p>
                <p>
                  <a href={set.citationUrl}>Open cited source</a>
                </p>
                <Link
                  className="nav-button"
                  href={`/rankings?set=${encodeURIComponent(set.id)}&sort=tier`}
                >
                  View this list alone
                </Link>
              </article>
            ))}
          </div>
          {showSummary && (
            <section className="notice">
              <strong>Derived ordinal method</strong>
              <p>
                Within each declared best-to-worst scale of at least two tiers,
                the top tier is 0% and the bottom tier is 100%, with
                intermediate tiers spaced evenly. The table shows the median and
                full range across covered sources. Each source has equal weight;
                missing entries, within-tier position, publication date, game
                version and scope differences are not adjusted. At least two
                usable sources are required.
              </p>
            </section>
          )}
          {rows.length && isolatedSet ? (
            <section className="ranking-isolated">
              <p className="eyebrow">Single cited ranking set</p>
              <h2>{isolatedSet.title}</h2>
              {isolatedSet.scale.map((tier) => {
                const tierRows = rows.filter(
                  (row) => row.rankings[isolatedSet.id]?.tier === tier,
                );
                return tierRows.length ? (
                  <section className="ranking-tier" key={tier}>
                    <h3>{tier}</h3>
                    <div className="grid">
                      {tierRows.map((row) => (
                        <Link
                          className="card"
                          href={`/catalog/${row.entity.kind}/${row.entity.slug}`}
                          key={`${row.entity.kind}:${row.entity.slug}`}
                        >
                          <span className="tag">{tier}</span>
                          <h3>{row.entity.name}</h3>
                          {row.rankings[isolatedSet.id]?.notes && (
                            <p className="muted">
                              {row.rankings[isolatedSet.id]?.notes}
                            </p>
                          )}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null;
              })}
            </section>
          ) : rows.length ? (
            <div className="ranking-table-wrap">
              <table className="ranking-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Coverage</th>
                    {showSummary && <th>Derived ordinal</th>}
                    {comparison.sets.map((set) => (
                      <th key={set.id}>{set.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.entity.kind}:${row.entity.slug}`}>
                      <th>
                        <Link
                          href={`/catalog/${row.entity.kind}/${row.entity.slug}`}
                        >
                          {row.entity.name}
                        </Link>
                      </th>
                      <td>
                        {Object.keys(row.rankings).length}/
                        {comparison.sets.length}
                      </td>
                      {showSummary && (
                        <td>
                          {row.summary ? (
                            <>
                              <strong>
                                {formatPercent(row.summary.medianScalePosition)}
                              </strong>
                              <br />
                              <span className="muted">
                                range{" "}
                                {formatPercent(
                                  row.summary.minimumScalePosition,
                                )}
                                –
                                {formatPercent(
                                  row.summary.maximumScalePosition,
                                )}{" "}
                                · {row.summary.sourceCount} sources
                              </span>
                            </>
                          ) : (
                            <span className="muted">Need 2 sources</span>
                          )}
                        </td>
                      )}
                      {comparison.sets.map((set) => {
                        const ranking = row.rankings[set.id];
                        return (
                          <td key={set.id}>
                            {ranking ? (
                              <>
                                <strong>{ranking.tier}</strong>
                                {ranking.position === undefined
                                  ? ""
                                  : ` #${ranking.position}`}
                                {ranking.timestampSeconds === undefined ? (
                                  ""
                                ) : (
                                  <>
                                    <br />
                                    <a className="muted" href={set.citationUrl}>
                                      at{" "}
                                      {formatTimestamp(
                                        ranking.timestampSeconds,
                                      )}
                                    </a>
                                  </>
                                )}
                                {ranking.notes && (
                                  <p className="muted ranking-note">
                                    {ranking.notes}
                                  </p>
                                )}
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice">No ranked items match this filter.</p>
          )}
        </>
      ) : (
        <p className="notice">
          No editorial ranking sets are active. Import a cited manual ranking
          YAML file first.
        </p>
      )}
    </>
  );
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(timestamp);
}
function formatTimestamp(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type RankingRow = ReturnType<typeof compareEditorialRankings>["rows"][number];
type RankingSet = ReturnType<typeof compareEditorialRankings>["sets"][number];

function compareByTier(
  left: RankingRow,
  right: RankingRow,
  sets: RankingSet[],
): number {
  const score = (row: RankingRow) => {
    const positions = sets.flatMap((set) => {
      const ranking = row.rankings[set.id];
      const index = ranking ? set.scale.indexOf(ranking.tier) : -1;
      return index < 0 || set.scale.length < 2
        ? []
        : [index / (set.scale.length - 1)];
    });
    return positions.length
      ? positions.reduce((total, value) => total + value, 0) / positions.length
      : Number.POSITIVE_INFINITY;
  };
  return (
    score(left) - score(right) ||
    left.entity.name.localeCompare(right.entity.name)
  );
}
