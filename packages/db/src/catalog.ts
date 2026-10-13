import type Database from "better-sqlite3";

export interface CatalogSummary {
  kind: string;
  slug: string;
  name: string;
  description?: string;
}
export const DISCOVERY_KINDS = ["quest", "mechanic", "secret", "enemy", "boss"] as const;
export type DiscoveryKind = typeof DISCOVERY_KINDS[number];

export interface CatalogItem extends CatalogSummary {
  components: Array<{ kind: string; slug: string; name: string; quantity: number }>;
  drops: Array<{ nodeSlug?: string; node: string; chance?: number; rotation?: string }>;
  sources: Array<{ name: string; homepage: string }>;
  rankings: Array<{ title: string; author: string; tier: string; timestampSeconds?: number; sourceUrl: string }>;
  evidence: Array<{ fact: string; sourceName: string; version: string; recordKey?: string; citationUrl?: string; sourcePath?: string; snapshotPath?: string }>;
}

export interface CatalogNode {
  id?: string;
  slug: string;
  name: string;
  description?: string;
  planet?: string;
  missionType?: string;
  faction?: string;
  minimumEnemyLevel?: number;
  maximumEnemyLevel?: number;
  masteryRequirement?: number;
  detailEvidence: Array<{ sourceName: string; version: string; recordKey: string; sourcePath?: string; citationUrl?: string }>;
  drops: Array<{
    kind: string;
    slug: string;
    name: string;
    chance?: number;
    rotation?: string;
    inventory?: { ownedCount: number; builtCount: number; wantedCount: number; needed: boolean };
  }>;
}

export interface StarChartNode extends Omit<CatalogNode, "drops" | "id"> {
  rewardCount: number;
  neededRewardCount?: number;
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

export function searchDiscoveryCatalog(sqlite: Database.Database, input: { query?: string; kind?: DiscoveryKind; limit?: number } = {}): CatalogSummary[] {
  if (input.kind && !(DISCOVERY_KINDS as readonly string[]).includes(input.kind)) throw new Error("Discovery kind is invalid");
  const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 200)));
  const pattern = `%${escapeLike(input.query?.trim() ?? "")}%`;
  const kindPlaceholders = DISCOVERY_KINDS.map(() => "?").join(", ");
  return sqlite.prepare(`
    select kind, slug, name, description from entities
    where retired = 0 and kind in (${kindPlaceholders})
      and (? is null or kind = ?) and name like ? escape '\\'
    order by case kind when 'quest' then 0 when 'mechanic' then 1 when 'secret' then 2 when 'boss' then 3 else 4 end,
      name collate nocase limit ?
  `).all(...DISCOVERY_KINDS, input.kind ?? null, input.kind ?? null, pattern, normalizedLimit) as CatalogSummary[];
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
  const evidence = sqlite.prepare(`
    select 'entity.' || provenance.field as fact, source.name as sourceName, run.version,
           provenance.source_record_key as recordKey, provenance.citation_url as citationUrl,
           provenance.source_path as sourcePath, run.snapshot_path as snapshotPath
    from fact_provenance provenance
    join source_runs run on run.id = provenance.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where provenance.entity_id = ?
    union all
    select 'recipe' as fact, source.name, run.version, recipe.source_record_key,
           recipe.citation_url, recipe.source_path, run.snapshot_path
    from recipes recipe
    join source_runs run on run.id = recipe.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where recipe.output_id = ?
    union all
    select 'drop' as fact, source.name, run.version, item_drop.source_record_key,
           item_drop.citation_url, item_drop.source_path, run.snapshot_path
    from drops item_drop
    join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where item_drop.reward_id = ?
    union all
    select 'editorial-ranking' as fact, source.name, run.version, ranking.source_record_key,
           ranking.citation_url, ranking.source_path, run.snapshot_path
    from editorial_rankings ranking
    join ranking_sets ranking_set on ranking_set.id = ranking.set_id
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where ranking.entity_id = ?
    order by sourceName, fact, recordKey
  `).all(item.id, item.id, item.id, item.id) as Array<{ fact: string; sourceName: string; version: string; recordKey?: string; citationUrl?: string; sourcePath?: string; snapshotPath?: string }>;
  const { id: _id, ...summary } = item;
  return { ...summary, components, drops, sources, rankings, evidence };
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
  const details = loadNodeDetails(sqlite, [node.id]).get(node.id);
  const { id: _id, ...summary } = node;
  return { ...summary, ...details, detailEvidence: details?.detailEvidence ?? [], drops };
}

export function listCatalogNodes(sqlite: Database.Database, limit = 500): CatalogNode[] {
  const normalizedLimit = Math.max(1, Math.min(2_000, Math.trunc(limit)));
  const nodes = sqlite.prepare("select id, slug, name, description from entities where kind = 'node' and retired = 0 order by name collate nocase limit ?")
    .all(normalizedLimit) as Array<{ id: string; slug: string; name: string; description?: string }>;
  const details = loadNodeDetails(sqlite, nodes.map(({ id }) => id));
  return nodes.map(({ id, ...node }) => ({ ...node, ...details.get(id), detailEvidence: details.get(id)?.detailEvidence ?? [], drops: [] }));
}

export function listStarChartNodes(sqlite: Database.Database, userId?: string): StarChartNode[] {
  const nodes = sqlite.prepare("select id, slug, name, description from entities where kind = 'node' and retired = 0 order by name collate nocase")
    .all() as Array<{ id: string; slug: string; name: string; description?: string }>;
  const details = loadNodeDetails(sqlite, nodes.map(({ id }) => id));
  const inventoryColumns = userId ? `coalesce(inventory.owned_count, 0) as ownedCount,
      coalesce(inventory.built_count, 0) as builtCount,
      coalesce(inventory.wanted_count, 0) as wantedCount` : "0 as ownedCount, 0 as builtCount, 0 as wantedCount";
  const rewards = sqlite.prepare(`
    select distinct item_drop.node_id as nodeId, item_drop.reward_id as rewardId,
      ${inventoryColumns}
    from drops item_drop join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
    ${userId ? "left join player_inventory inventory on inventory.entity_id = item_drop.reward_id and inventory.user_id = ?" : ""}
    where item_drop.node_id is not null
  `).all(...(userId ? [userId] : [])) as Array<{ nodeId: string; rewardId: string; ownedCount: number; builtCount: number; wantedCount: number }>;
  const counts = new Map<string, { rewardCount: number; neededRewardCount: number }>();
  for (const reward of rewards) {
    const count = counts.get(reward.nodeId) ?? { rewardCount: 0, neededRewardCount: 0 };
    count.rewardCount += 1;
    if (userId && (reward.ownedCount + reward.builtCount === 0 || reward.wantedCount > 0)) count.neededRewardCount += 1;
    counts.set(reward.nodeId, count);
  }
  return nodes.map(({ id, ...node }) => ({ ...node, ...details.get(id), detailEvidence: details.get(id)?.detailEvidence ?? [], rewardCount: counts.get(id)?.rewardCount ?? 0, ...(userId ? { neededRewardCount: counts.get(id)?.neededRewardCount ?? 0 } : {}) }));
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

type NodeDetails = Pick<CatalogNode, "planet" | "missionType" | "faction" | "minimumEnemyLevel" | "maximumEnemyLevel" | "masteryRequirement" | "detailEvidence">;
function loadNodeDetails(sqlite: Database.Database, entityIds: string[]): Map<string, NodeDetails> {
  if (!entityIds.length) return new Map();
  const placeholders = entityIds.map(() => "?").join(", ");
  const rows = sqlite.prepare(`
    select detail.entity_id as entityId, detail.planet, detail.mission_type as missionType,
      detail.faction, detail.minimum_enemy_level as minimumEnemyLevel,
      detail.maximum_enemy_level as maximumEnemyLevel, detail.mastery_requirement as masteryRequirement,
      source.name as sourceName, run.version, detail.source_record_key as recordKey,
      detail.source_path as sourcePath, detail.citation_url as citationUrl
    from node_details detail
    join source_runs run on run.id = detail.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where detail.entity_id in (${placeholders})
    order by source.priority desc, run.retrieved_at desc
  `).all(...entityIds) as Array<{ entityId: string; planet: string; missionType: string | null; faction: string | null; minimumEnemyLevel: number | null; maximumEnemyLevel: number | null; masteryRequirement: number | null; sourceName: string; version: string; recordKey: string; sourcePath: string | null; citationUrl: string | null }>;
  const result = new Map<string, NodeDetails>();
  for (const row of rows) {
    const current = result.get(row.entityId) ?? { detailEvidence: [] };
    current.planet ??= row.planet;
    current.missionType ??= row.missionType ?? undefined;
    current.faction ??= row.faction ?? undefined;
    current.minimumEnemyLevel ??= row.minimumEnemyLevel ?? undefined;
    current.maximumEnemyLevel ??= row.maximumEnemyLevel ?? undefined;
    current.masteryRequirement ??= row.masteryRequirement ?? undefined;
    current.detailEvidence.push({ sourceName: row.sourceName, version: row.version, recordKey: row.recordKey, sourcePath: row.sourcePath ?? undefined, citationUrl: row.citationUrl ?? undefined });
    result.set(row.entityId, current);
  }
  return result;
}
