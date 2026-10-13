import type Database from "better-sqlite3";

export interface EditorialRankingSetSummary {
  id: string;
  title: string;
  author: string;
  publishedAt: number;
  gameVersion?: string;
  scope: string;
  scale: string[];
  licenseNote: string;
  citationUrl: string;
}
export interface EditorialRankingComparisonRow {
  entity: { kind: string; slug: string; name: string };
  rankings: Record<string, { tier: string; position?: number; timestampSeconds?: number; notes?: string }>;
}
export interface EditorialRankingComparison { sets: EditorialRankingSetSummary[]; rows: EditorialRankingComparisonRow[] }

export function compareEditorialRankings(sqlite: Database.Database, query = "", limit = 200): EditorialRankingComparison {
  const sets = (sqlite.prepare(`
    select ranking_set.id, ranking_set.title, ranking_set.author,
      ranking_set.published_at as publishedAt, ranking_set.game_version as gameVersion,
      ranking_set.scope, ranking_set.scale_json as scaleJson,
      ranking_set.license_note as licenseNote,
      coalesce(ranking_set.citation_url, source.homepage) as citationUrl
    from ranking_sets ranking_set
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    order by ranking_set.published_at desc, ranking_set.title collate nocase
  `).all() as Array<Omit<EditorialRankingSetSummary, "scale" | "gameVersion"> & { scaleJson: string; gameVersion: string | null }>).map(({ scaleJson, gameVersion, ...set }) => ({ ...set, gameVersion: gameVersion ?? undefined, scale: parseScale(scaleJson) }));
  if (!sets.length) return { sets, rows: [] };
  const normalizedLimit = Math.max(1, Math.min(1_000, Math.trunc(limit)));
  const entityRows = sqlite.prepare(`
    select distinct entity.id, entity.kind, entity.slug, entity.name
    from editorial_rankings ranking
    join ranking_sets ranking_set on ranking_set.id = ranking.set_id
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    join entities entity on entity.id = ranking.entity_id and entity.retired = 0
    where entity.name like ? escape '\\'
    order by entity.name collate nocase, entity.kind limit ?
  `).all(`%${escapeLike(query.trim())}%`, normalizedLimit) as Array<{ id: string; kind: string; slug: string; name: string }>;
  if (!entityRows.length) return { sets, rows: [] };
  const placeholders = entityRows.map(() => "?").join(", ");
  const rankings = sqlite.prepare(`
    select ranking.entity_id as entityId, ranking.set_id as setId, ranking.tier,
      ranking.position, ranking.timestamp_seconds as timestampSeconds, ranking.notes
    from editorial_rankings ranking
    join ranking_sets ranking_set on ranking_set.id = ranking.set_id
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    where ranking.entity_id in (${placeholders})
  `).all(...entityRows.map(({ id }) => id)) as Array<{ entityId: string; setId: string; tier: string; position: number | null; timestampSeconds: number | null; notes: string | null }>;
  const byEntity = new Map<string, EditorialRankingComparisonRow["rankings"]>();
  for (const ranking of rankings) byEntity.set(ranking.entityId, { ...(byEntity.get(ranking.entityId) ?? {}), [ranking.setId]: { tier: ranking.tier, position: ranking.position ?? undefined, timestampSeconds: ranking.timestampSeconds ?? undefined, notes: ranking.notes ?? undefined } });
  return { sets, rows: entityRows.map(({ id, ...entity }) => ({ entity, rankings: byEntity.get(id) ?? {} })) };
}

function parseScale(value: string): string[] { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : []; }
function escapeLike(value: string): string { return value.replace(/[\\%_]/g, "\\$&"); }
