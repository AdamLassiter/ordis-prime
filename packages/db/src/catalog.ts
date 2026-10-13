import type Database from "better-sqlite3";

export interface CatalogSummary {
  kind: string;
  slug: string;
  name: string;
  description?: string;
}

export interface CatalogItem extends CatalogSummary {
  components: Array<{ kind: string; slug: string; name: string; quantity: number }>;
  drops: Array<{ nodeSlug?: string; node: string; chance?: number; rotation?: string }>;
  sources: Array<{ name: string; homepage: string }>;
  rankings: Array<{ title: string; author: string; tier: string; timestampSeconds?: number; sourceUrl: string }>;
}

export interface CatalogNode {
  slug: string;
  name: string;
  description?: string;
  drops: Array<{
    kind: string;
    slug: string;
    name: string;
    chance?: number;
    rotation?: string;
    inventory?: { ownedCount: number; builtCount: number; wantedCount: number; needed: boolean };
  }>;
}

export interface SourceStatus {
  id: string;
  name: string;
  homepage: string;
  license?: string;
  version?: string;
  retrievedAt?: number;
  contentHash?: string;
  conflictCount: number;
  latestRefreshStatus?: "running" | "succeeded" | "failed";
  latestRefreshStartedAt?: number;
  latestRefreshFinishedAt?: number;
}

export function searchCatalog(sqlite: Database.Database, query = "", limit = 100): CatalogSummary[] {
  const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const pattern = `%${escapeLike(query.trim())}%`;
  return sqlite.prepare(`
    select kind, slug, name, description
    from entities
    where retired = 0 and name like ? escape '\\'
    order by case when lower(name) = lower(?) then 0 else 1 end, name collate nocase, kind
    limit ?
  `).all(pattern, query.trim(), normalizedLimit) as CatalogSummary[];
}

export function findCatalogItem(sqlite: Database.Database, kind: string, slug: string): CatalogItem | undefined {
  const item = sqlite.prepare("select id, kind, slug, name, description from entities where kind = ? and slug = ? and retired = 0")
    .get(kind, slug) as (CatalogSummary & { id: string }) | undefined;
  if (!item) return undefined;

  const components = sqlite.prepare(`
    select distinct ingredient.kind, ingredient.slug, ingredient.name, ri.quantity
    from recipes r
    join source_runs run on run.id = r.source_run_id and run.status = 'active'
    join recipe_ingredients ri on ri.recipe_id = r.id
    join entities ingredient on ingredient.id = ri.entity_id
    where r.output_id = ? and ingredient.retired = 0
    order by ingredient.name collate nocase
  `).all(item.id) as CatalogItem["components"];
  const drops = sqlite.prepare(`
    select node.slug as nodeSlug, d.location_label as node, d.chance, d.rotation
    from drops d
    join source_runs run on run.id = d.source_run_id and run.status = 'active'
    left join entities node on node.id = d.node_id and node.retired = 0
    where d.reward_id = ?
    order by d.location_label collate nocase, d.rotation
  `).all(item.id) as CatalogItem["drops"];
  const sources = sqlite.prepare(`
    select distinct source.name, source.homepage
    from fact_provenance provenance
    join source_runs run on run.id = provenance.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where provenance.entity_id = ?
    order by source.priority desc, source.name
  `).all(item.id) as CatalogItem["sources"];
  const rankings = sqlite.prepare(`
    select ranking_set.title, ranking_set.author, ranking.tier,
           ranking.timestamp_seconds as timestampSeconds, source.homepage as sourceUrl
    from editorial_rankings ranking
    join ranking_sets ranking_set on ranking_set.id = ranking.set_id
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where ranking.entity_id = ?
    order by ranking_set.published_at desc, ranking_set.title
  `).all(item.id) as CatalogItem["rankings"];
  const { id: _id, ...summary } = item;
  return { ...summary, components, drops, sources, rankings };
}

export function findCatalogNode(sqlite: Database.Database, slug: string, userId?: string): CatalogNode | undefined {
  const node = sqlite.prepare("select id, slug, name, description from entities where kind = 'node' and slug = ? and retired = 0")
    .get(slug) as ({ id: string; slug: string; name: string; description?: string }) | undefined;
  if (!node) return undefined;
  const inventoryJoin = userId ? "left join player_inventory inventory on inventory.entity_id = reward.id and inventory.user_id = ?" : "";
  const inventoryColumns = userId
    ? ", coalesce(inventory.owned_count, 0) as ownedCount, coalesce(inventory.built_count, 0) as builtCount, coalesce(inventory.wanted_count, 0) as wantedCount"
    : "";
  const rows = sqlite.prepare(`
    select reward.kind, reward.slug, reward.name, d.chance, d.rotation${inventoryColumns}
    from drops d
    join source_runs run on run.id = d.source_run_id and run.status = 'active'
    join entities reward on reward.id = d.reward_id and reward.retired = 0
    ${inventoryJoin}
    where d.node_id = ?
    order by reward.name collate nocase, d.rotation
  `).all(...(userId ? [userId, node.id] : [node.id])) as Array<Omit<CatalogNode["drops"][number], "inventory"> & { ownedCount?: number; builtCount?: number; wantedCount?: number }>;
  const drops = rows.map(({ ownedCount, builtCount, wantedCount, ...drop }) => ({
    ...drop,
    ...(userId ? { inventory: {
      ownedCount: ownedCount ?? 0,
      builtCount: builtCount ?? 0,
      wantedCount: wantedCount ?? 0,
      needed: (ownedCount ?? 0) + (builtCount ?? 0) === 0 || (wantedCount ?? 0) > 0,
    } } : {}),
  }));
  const { id: _id, ...summary } = node;
  return { ...summary, drops };
}

export function listCatalogNodes(sqlite: Database.Database, limit = 500): CatalogNode[] {
  const normalizedLimit = Math.max(1, Math.min(2_000, Math.trunc(limit)));
  return (sqlite.prepare("select slug, name, description from entities where kind = 'node' and retired = 0 order by name collate nocase limit ?")
    .all(normalizedLimit) as Array<Omit<CatalogNode, "drops">>).map((node) => ({ ...node, drops: [] }));
}

export function listSourceStatuses(sqlite: Database.Database): SourceStatus[] {
  return sqlite.prepare(`
    select source.id, source.name, source.homepage, source.license,
           run.version, run.retrieved_at as retrievedAt, run.content_hash as contentHash,
           count(conflict.id) as conflictCount, refresh.status as latestRefreshStatus,
           refresh.started_at as latestRefreshStartedAt, refresh.finished_at as latestRefreshFinishedAt
    from sources source
    left join source_runs run on run.source_id = source.id and run.status = 'active'
    left join ingestion_conflicts conflict on conflict.source_run_id = run.id and conflict.resolved_at is null
    left join source_refreshes refresh on refresh.id = (
      select candidate.id from source_refreshes candidate
      where candidate.source_id = source.id
      order by candidate.started_at desc, candidate.rowid desc limit 1
    )
    where source.enabled = 1
    group by source.id, run.id, refresh.id
    order by source.priority desc, source.name collate nocase
  `).all() as SourceStatus[];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
