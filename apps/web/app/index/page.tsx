import Link from "next/link";
import {
  getMarketIndexStatus,
  listArcaneMarketIndex,
  listRelicMarketIndex,
  listSyndicateModIndex,
  type MarketPriceBasis,
} from "@ordis-prime/db";
import type { RelicRefinement } from "@ordis-prime/domain";
import { getDatabase } from "@/lib/database";
import { getCurrentSession } from "@/lib/session";
import { CollectionStateIndicators } from "@/app/collection-state-indicators";
import { deriveCollectionState } from "@ordis-prime/domain";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
type SortDirection = "asc" | "desc";
type SortValue = number | string | undefined;

export default async function IndexPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const section = one(params.section) ?? "relics";
  const basis = one(params.basis) === "quick-sale" ? "quick-sale" : "listing";
  const database = getDatabase();
  const session = await getCurrentSession();
  const status = getMarketIndexStatus(database);
  return (
    <>
      <p className="eyebrow">
        The Index · public Warframe.market offer intelligence
      </p>
      <p className="lede">
        Compare unopened relics with their reward tables, find high-return
        Syndicate mods, and inspect Arcane set economics. Values are visible
        offers, not completed sales or guaranteed prices.
      </p>
      <section className="notice index-status">
        <strong>
          {formatCoverage(status.completedCount, status.targetCount)}
        </strong>
        <span>
          {status.status ?? "not refreshed"}
          {status.finishedAt ? ` · ${formatDate(status.finishedAt)}` : ""}
          {status.failedCount ? ` · ${status.failedCount} unavailable` : ""}
        </span>
      </section>
      <nav className="section-tabs" aria-label="Index views">
        {[
          ["relics", "Relics"],
          ["mods", "Syndicate mods"],
          ["arcanes", "Arcanes"],
        ].map(([value, label]) => (
          <Link
            className={section === value ? "active" : undefined}
            href={`/index?section=${value}&basis=${basis}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      {section === "mods" ? (
        <ModsView params={params} basis={basis} userId={session?.user.id} />
      ) : section === "arcanes" ? (
        <ArcanesView params={params} basis={basis} userId={session?.user.id} />
      ) : (
        <RelicsView params={params} basis={basis} userId={session?.user.id} />
      )}
    </>
  );
}

function RelicsView({
  params,
  basis,
  userId,
}: {
  params: Params;
  basis: MarketPriceBasis;
  userId?: string;
}) {
  const refinement = refinementParam(one(params.refinement));
  const era = one(params.era) ?? "all";
  const availability = availabilityParam(one(params.availability));
  const squad = one(params.squad) === "four-player" ? "four-player" : "solo";
  const query = one(params.q) ?? "";
  const ownedOnly = one(params.owned) === "yes";
  const sort = sortSelection(
    params,
    ["name", "unopened", "open", "delta", "ducats", "trace", "coverage"],
    "open",
    "desc",
  );
  const allRows = sortRows(
    listRelicMarketIndex(getDatabase(), {
      refinement,
      era,
      availability,
      basis,
      squad,
      query,
      userId,
    }).filter((row) => !ownedOnly || (row.ownedCount ?? 0) > 0),
    sort.direction,
    (row) => {
      switch (sort.key) {
        case "name":
          return row.entity.name;
        case "unopened":
          return row.directValue;
        case "delta":
          return row.openingDelta;
        case "ducats":
          return row.ducatExpectedValue;
        case "trace":
          return row.traceEfficiency;
        case "coverage":
          return row.pricedRewards / row.rewardCount;
        default:
          return row.openValue;
      }
    },
    (row) => row.entity.name,
  );
  const { rows, page, pageCount } = paginate(allRows, one(params.page));
  return (
    <section className="index-section">
      <h2>Relic expected value</h2>
      <p className="muted">
        Four-player mode assumes four identical relics and values the best
        visible reward for each player.
      </p>
      <IndexFilters section="relics" basis={basis} query={query} sort={sort}>
        <Select
          name="refinement"
          value={refinement}
          options={["intact", "exceptional", "flawless", "radiant"]}
        />
        <Select
          name="era"
          value={era}
          options={["all", "lith", "meso", "neo", "axi", "requiem"]}
        />
        <Select
          name="availability"
          value={availability}
          options={["all", "current", "vaulted"]}
        />
        <Select name="squad" value={squad} options={["solo", "four-player"]} />
        {userId && (
          <Check name="owned" checked={ownedOnly}>
            Owned relics only
          </Check>
        )}
      </IndexFilters>
      <div className="index-table-wrap">
        <table className="index-table">
          <thead>
            <tr>
              <SortHeader params={params} selection={sort} sortKey="name">
                Relic
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="unopened">
                Unopened
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="open">
                Opening EV
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="delta">
                Open − sell
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="ducats">
                Ducat EV
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="trace">
                Trace return
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="coverage">
                Coverage
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entity.id}>
                <th>
                  <details>
                    <summary>
                      <Link
                        href={`/catalog/${row.entity.kind}/${row.entity.slug}`}
                      >
                        {row.entity.name}
                      </Link>
                    </summary>
                    <div className="index-rewards">
                      {row.rewards.map((reward, rewardIndex) => (
                        <p key={`${reward.entity.id}:${rewardIndex}`}>
                          <span className={`tag rarity-${reward.rarity}`}>
                            {reward.rarity}
                          </span>{" "}
                          <Link
                            href={`/catalog/${reward.entity.kind}/${reward.entity.slug}`}
                          >
                            {reward.entity.name}
                          </Link>
                          {" · "}
                          {percent(reward.chance)} · {plat(reward.value)} ·{" "}
                          {plat(reward.contribution)} contribution
                          {reward.ownedCount !== undefined
                            ? ` · owned ${reward.ownedCount}`
                            : ""}
                          {userId && (
                            <IndexCollectionState
                              kind={reward.entity.kind}
                              ownedCount={reward.ownedCount}
                            />
                          )}
                        </p>
                      ))}
                    </div>
                  </details>
                  <small>
                    {row.era} · {row.vaulted ? "vaulted" : "current"}
                    {row.ownedCount !== undefined
                      ? ` · owned ${row.ownedCount}`
                      : ""}
                    {userId && (
                      <IndexCollectionState
                        kind={row.entity.kind}
                        ownedCount={row.ownedCount}
                      />
                    )}
                  </small>
                </th>
                <td>{plat(row.directValue)}</td>
                <td>
                  {plat(row.openValue)}
                  {row.bestRefinement && row.bestRefinement !== refinement ? (
                    <small> Best: {title(row.bestRefinement)}</small>
                  ) : null}
                </td>
                <td>{signedPlat(row.openingDelta)}</td>
                <td>{row.ducatExpectedValue.toFixed(1)}</td>
                <td>
                  {row.traceEfficiency === undefined
                    ? "—"
                    : `${row.traceEfficiency >= 0 ? "+" : ""}${row.traceEfficiency.toFixed(2)}p/trace`}
                </td>
                <td>
                  {row.pricedRewards}/{row.rewardCount}
                  {row.stale ? <small> stale</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        params={params}
        page={page}
        pageCount={pageCount}
        total={allRows.length}
      />
      {!rows.length && (
        <p className="notice">
          No relics match these filters, or relic reward data has not been
          refreshed yet.
        </p>
      )}
    </section>
  );
}

function ModsView({
  params,
  basis,
  userId,
}: {
  params: Params;
  basis: MarketPriceBasis;
  userId?: string;
}) {
  const query = one(params.q) ?? "";
  const coreOnly = one(params.scope) !== "all";
  const sort = sortSelection(
    params,
    ["name", "faction", "standing", "market", "return", "requirement"],
    "return",
    "desc",
  );
  const allRows = sortRows(
    listSyndicateModIndex(getDatabase(), {
      basis,
      coreOnly,
      query,
      userId,
    }),
    sort.direction,
    (row) => {
      switch (sort.key) {
        case "name":
          return row.entity.name;
        case "faction":
          return row.faction;
        case "standing":
          return row.cost / row.quantity;
        case "market":
          return row.value;
        case "requirement":
          return row.prerequisiteRank;
        default:
          return row.platinumPerThousandStanding;
      }
    },
    (row) => row.entity.name,
  );
  const { rows, page, pageCount } = paginate(allRows, one(params.page));
  return (
    <section className="index-section">
      <h2>Syndicate mod value</h2>
      <IndexFilters section="mods" basis={basis} query={query} sort={sort}>
        <Select
          name="scope"
          value={coreOnly ? "core" : "all"}
          options={["core", "all"]}
        />
      </IndexFilters>
      <div className="index-table-wrap">
        <table className="index-table">
          <thead>
            <tr>
              <SortHeader params={params} selection={sort} sortKey="name">
                Mod
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="faction">
                Faction
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="standing">
                Standing
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="market">
                Market
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="return">
                Return
              </SortHeader>
              <SortHeader
                params={params}
                selection={sort}
                sortKey="requirement"
              >
                Requirement
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.faction}:${row.entity.id}`}>
                <th>
                  <Link href={`/catalog/${row.entity.kind}/${row.entity.slug}`}>
                    {row.entity.name}
                  </Link>
                  {userId && (
                    <IndexCollectionState
                      kind={row.entity.kind}
                      ownedCount={row.ownedCount}
                    />
                  )}
                </th>
                <td>
                  {row.faction}
                  {row.core && <small>Core six</small>}
                </td>
                <td>
                  {row.cost.toLocaleString()} / {row.quantity}
                </td>
                <td>
                  {plat(row.value)}
                  {row.stale && <small>stale</small>}
                </td>
                <td>
                  {row.platinumPerThousandStanding === undefined
                    ? "—"
                    : `${row.platinumPerThousandStanding.toFixed(2)}p / 1k`}
                </td>
                <td>
                  {row.prerequisiteLabel ??
                    (row.prerequisiteRank === undefined
                      ? "—"
                      : `Rank ${row.prerequisiteRank}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        params={params}
        page={page}
        pageCount={pageCount}
        total={allRows.length}
      />
      {!rows.length && (
        <p className="notice">
          No market-linked Standing mods are available yet. Refresh the Wiki
          vendor and market sources.
        </p>
      )}
    </section>
  );
}

function ArcanesView({
  params,
  basis,
  userId,
}: {
  params: Params;
  basis: MarketPriceBasis;
  userId?: string;
}) {
  const query = one(params.q) ?? "";
  const rank = one(params.rank) === "max" ? "max" : "zero";
  const standingOnly = one(params.source) === "standing";
  const sort = sortSelection(
    params,
    ["name", "rank-zero", "max-rank", "per-copy", "standing"],
    rank === "max" ? "max-rank" : "rank-zero",
    "desc",
  );
  const allRows = sortRows(
    listArcaneMarketIndex(getDatabase(), {
      basis,
      standingOnly,
      query,
      userId,
    }),
    sort.direction,
    (row) => {
      switch (sort.key) {
        case "name":
          return row.entity.name;
        case "max-rank":
          return row.maxRankValue;
        case "per-copy":
          return row.maxRankPerCopyValue;
        case "standing":
          return row.standingOffers.length;
        default:
          return row.rankZeroValue;
      }
    },
    (row) => row.entity.name,
  );
  const { rows, page, pageCount } = paginate(allRows, one(params.page));
  return (
    <section className="index-section">
      <h2>Arcane market value</h2>
      <IndexFilters section="arcanes" basis={basis} query={query} sort={sort}>
        <Select name="rank" value={rank} options={["zero", "max"]} />
        <Select
          name="source"
          value={standingOnly ? "standing" : "all"}
          options={["all", "standing"]}
        />
      </IndexFilters>
      <div className="index-table-wrap">
        <table className="index-table">
          <thead>
            <tr>
              <SortHeader params={params} selection={sort} sortKey="name">
                Arcane
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="rank-zero">
                Rank 0
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="max-rank">
                Max rank
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="per-copy">
                Per-copy max
              </SortHeader>
              <SortHeader params={params} selection={sort} sortKey="standing">
                Standing sources
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entity.id}>
                <th>
                  <Link href={`/catalog/${row.entity.kind}/${row.entity.slug}`}>
                    {row.entity.name}
                  </Link>
                  <small>
                    Rank {row.maxRank} uses {row.copiesForMaxRank} copies
                    {row.ownedCount !== undefined
                      ? ` · owned ${row.ownedCount}`
                      : ""}
                  </small>
                  {userId && (
                    <IndexCollectionState
                      kind={row.entity.kind}
                      ownedCount={row.ownedCount}
                    />
                  )}
                </th>
                <td>{plat(row.rankZeroValue)}</td>
                <td>{plat(row.maxRankValue)}</td>
                <td>{plat(row.maxRankPerCopyValue)}</td>
                <td>
                  {row.standingOffers.length
                    ? row.standingOffers.map((offer) => (
                        <span
                          className="tag"
                          key={`${offer.faction}:${offer.vendor}`}
                        >
                          {offer.faction} · {offer.cost.toLocaleString()}
                        </span>
                      ))
                    : "—"}
                  {row.stale && <small>stale</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        params={params}
        page={page}
        pageCount={pageCount}
        total={allRows.length}
      />
    </section>
  );
}

const PAGE_SIZE = 100;

interface SortSelection {
  key: string;
  direction: SortDirection;
}

function sortSelection(
  params: Params,
  allowed: readonly string[],
  defaultKey: string,
  defaultDirection: SortDirection,
): SortSelection {
  const requestedKey = one(params.sort);
  const requestedDirection = one(params.dir);
  return {
    key:
      requestedKey && allowed.includes(requestedKey)
        ? requestedKey
        : defaultKey,
    direction:
      requestedDirection === "asc" || requestedDirection === "desc"
        ? requestedDirection
        : defaultDirection,
  };
}

function sortRows<T>(
  rows: T[],
  direction: SortDirection,
  value: (row: T) => SortValue,
  tieBreaker: (row: T) => string,
): T[] {
  return rows.sort((left, right) => {
    const compared = compareSortValues(value(left), value(right), direction);
    return compared || tieBreaker(left).localeCompare(tieBreaker(right));
  });
}

function compareSortValues(
  left: SortValue,
  right: SortValue,
  direction: SortDirection,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  const compared =
    typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(left) - Number(right);
  return direction === "asc" ? compared : -compared;
}

function SortHeader({
  params,
  selection,
  sortKey,
  children,
}: {
  params: Params;
  selection: SortSelection;
  sortKey: string;
  children: React.ReactNode;
}) {
  const active = selection.key === sortKey;
  const nextDirection: SortDirection = active
    ? selection.direction === "asc"
      ? "desc"
      : "asc"
    : sortKey === "name" || sortKey === "faction"
      ? "asc"
      : "desc";
  return (
    <th
      aria-sort={
        active
          ? selection.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <Link
        className={active ? "index-sort active" : "index-sort"}
        href={sortHref(params, sortKey, nextDirection)}
      >
        {children}
        <span aria-hidden="true">
          {active ? (selection.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

function paginate<T>(rows: T[], rawPage: string | undefined) {
  const requested = Number(rawPage ?? 1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, pageCount)
      : 1;
  return {
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageCount,
  };
}

function Pagination({
  params,
  page,
  pageCount,
  total,
}: {
  params: Params;
  page: number;
  pageCount: number;
  total: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="index-pagination" aria-label="Index result pages">
      {page > 1 ? (
        <Link href={pageHref(params, page - 1)}>Previous</Link>
      ) : (
        <span />
      )}
      <span>
        Page {page} of {pageCount} · {total.toLocaleString()} results
      </span>
      {page < pageCount ? (
        <Link href={pageHref(params, page + 1)}>Next</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function pageHref(params: Params, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    if (Array.isArray(value))
      for (const entry of value) query.append(key, entry);
    else query.set(key, value);
  }
  query.set("page", String(page));
  return `/index?${query.toString()}`;
}

function sortHref(
  params: Params,
  sort: string,
  direction: SortDirection,
): string {
  const query = indexQuery(params, ["page", "sort", "dir"]);
  query.set("sort", sort);
  query.set("dir", direction);
  return `/index?${query.toString()}`;
}

function indexQuery(params: Params, omitted: string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (omitted.includes(key) || value === undefined) continue;
    if (Array.isArray(value))
      for (const entry of value) query.append(key, entry);
    else query.set(key, value);
  }
  return query;
}

function IndexCollectionState({
  kind,
  ownedCount = 0,
}: {
  kind: string;
  ownedCount?: number;
}) {
  return (
    <span className="index-collection-state">
      <CollectionStateIndicators
        {...deriveCollectionState({
          kind,
          ownedCount,
          builtCount: 0,
          wantedCount: 0,
        })}
        ownedCount={ownedCount}
        compact
      />
    </span>
  );
}

function IndexFilters({
  section,
  basis,
  query,
  sort,
  children,
}: {
  section: string;
  basis: MarketPriceBasis;
  query: string;
  sort: SortSelection;
  children?: React.ReactNode;
}) {
  return (
    <form className="card index-filters">
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="sort" value={sort.key} />
      <input type="hidden" name="dir" value={sort.direction} />
      <label>
        Search
        <input name="q" defaultValue={query} placeholder="Item name…" />
      </label>
      <label>
        Price basis
        <select name="basis" defaultValue={basis}>
          <option value="listing">Listing estimate</option>
          <option value="quick-sale">Quick sale</option>
        </select>
      </label>
      {children}
      <button className="button">Apply</button>
    </form>
  );
}

function Select({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: string[];
}) {
  return (
    <label>
      {title(name)}
      <select name={name} defaultValue={value}>
        {options.map((option) => (
          <option value={option} key={option}>
            {title(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
function Check({
  name,
  checked,
  children,
}: {
  name: string;
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="check-label">
      <input type="checkbox" name={name} value="yes" defaultChecked={checked} />{" "}
      {children}
    </label>
  );
}
function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function refinementParam(value?: string): RelicRefinement {
  return value === "intact" || value === "exceptional" || value === "flawless"
    ? value
    : "radiant";
}
function availabilityParam(value?: string) {
  return value === "current" || value === "vaulted" ? value : ("all" as const);
}
function title(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function plat(value?: number) {
  return value === undefined
    ? "—"
    : `${value.toFixed(value < 10 && value % 1 ? 1 : 0)}p`;
}
function signedPlat(value?: number) {
  return value === undefined ? "—" : `${value >= 0 ? "+" : ""}${plat(value)}`;
}
function percent(value: number) {
  return `${(value * 100).toFixed((value * 100) % 1 ? 2 : 0)}%`;
}
function formatCoverage(done: number, total: number) {
  return total
    ? `${done.toLocaleString()} / ${total.toLocaleString()} prices`
    : "Price refresh pending";
}
function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
