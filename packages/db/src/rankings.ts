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
  rankings: Record<
    string,
    {
      tier: string;
      position?: number;
      timestampSeconds?: number;
      notes?: string;
    }
  >;
  summary?: {
    medianScalePosition: number;
    minimumScalePosition: number;
    maximumScalePosition: number;
    sourceCount: number;
  };
}
export interface EditorialRankingComparison {
  sets: EditorialRankingSetSummary[];
  rows: EditorialRankingComparisonRow[];
}

export function compareEditorialRankings(
  sqlite: Database.Database,
  input: { query?: string; setIds?: string[]; limit?: number } = {},
): EditorialRankingComparison {
  const allSets = (
    sqlite
      .prepare(
        `
    select ranking_set.id, ranking_set.title, ranking_set.author,
      ranking_set.published_at as publishedAt, ranking_set.game_version as gameVersion,
      ranking_set.scope, ranking_set.scale_json as scaleJson,
      ranking_set.license_note as licenseNote,
      coalesce(ranking_set.citation_url, source.homepage) as citationUrl
    from ranking_sets ranking_set
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    order by ranking_set.published_at desc, ranking_set.title collate nocase
  `,
      )
      .all() as Array<
      Omit<EditorialRankingSetSummary, "scale" | "gameVersion"> & {
        scaleJson: string;
        gameVersion: string | null;
      }
    >
  ).map(({ scaleJson, gameVersion, ...set }) => ({
    ...set,
    gameVersion: gameVersion ?? undefined,
    scale: parseScale(scaleJson),
  }));
  const selected = new Set(input.setIds?.filter(Boolean) ?? []);
  const sets = selected.size
    ? allSets.filter(({ id }) => selected.has(id))
    : allSets;
  if (!sets.length) return { sets, rows: [] };
  const normalizedLimit = Math.max(
    1,
    Math.min(1_000, Math.trunc(input.limit ?? 200)),
  );
  const setPlaceholders = sets.map(() => "?").join(", ");
  const entityRows = sqlite
    .prepare(
      `
    select distinct entity.id, entity.kind, entity.slug, entity.name
    from editorial_rankings ranking
    join ranking_sets ranking_set on ranking_set.id = ranking.set_id
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    join entities entity on entity.id = ranking.entity_id and entity.retired = 0
    where ranking.set_id in (${setPlaceholders}) and entity.name like ? escape '\\'
    order by entity.name collate nocase, entity.kind limit ?
  `,
    )
    .all(
      ...sets.map(({ id }) => id),
      `%${escapeLike(input.query?.trim() ?? "")}%`,
      normalizedLimit,
    ) as Array<{ id: string; kind: string; slug: string; name: string }>;
  if (!entityRows.length) return { sets, rows: [] };
  const placeholders = entityRows.map(() => "?").join(", ");
  const rankings = sqlite
    .prepare(
      `
    select ranking.entity_id as entityId, ranking.set_id as setId, ranking.tier,
      ranking.position, ranking.timestamp_seconds as timestampSeconds, ranking.notes
    from editorial_rankings ranking
    join ranking_sets ranking_set on ranking_set.id = ranking.set_id
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    where ranking.entity_id in (${placeholders}) and ranking.set_id in (${setPlaceholders})
  `,
    )
    .all(
      ...entityRows.map(({ id }) => id),
      ...sets.map(({ id }) => id),
    ) as Array<{
    entityId: string;
    setId: string;
    tier: string;
    position: number | null;
    timestampSeconds: number | null;
    notes: string | null;
  }>;
  const byEntity = new Map<string, EditorialRankingComparisonRow["rankings"]>();
  for (const ranking of rankings)
    byEntity.set(ranking.entityId, {
      ...(byEntity.get(ranking.entityId) ?? {}),
      [ranking.setId]: {
        tier: ranking.tier,
        position: ranking.position ?? undefined,
        timestampSeconds: ranking.timestampSeconds ?? undefined,
        notes: ranking.notes ?? undefined,
      },
    });
  const scales = new Map(sets.map(({ id, scale }) => [id, scale]));
  return {
    sets,
    rows: entityRows.map(({ id, ...entity }) => {
      const entityRankings = byEntity.get(id) ?? {};
      const summary = summarizeRankings(entityRankings, scales);
      return {
        entity,
        rankings: entityRankings,
        ...(summary ? { summary } : {}),
      };
    }),
  };
}

function summarizeRankings(
  rankings: EditorialRankingComparisonRow["rankings"],
  scales: Map<string, string[]>,
): EditorialRankingComparisonRow["summary"] {
  const positions = Object.entries(rankings)
    .flatMap(([setId, ranking]) => {
      const scale = scales.get(setId) ?? [];
      const tierIndex = scale.indexOf(ranking.tier);
      if (tierIndex < 0 || scale.length < 2) return [];
      return [tierIndex / (scale.length - 1)];
    })
    .sort((left, right) => left - right);
  if (positions.length < 2) return undefined;
  const middle = Math.floor(positions.length / 2);
  const median =
    positions.length % 2
      ? positions[middle]!
      : (positions[middle - 1]! + positions[middle]!) / 2;
  return {
    medianScalePosition: median,
    minimumScalePosition: positions[0]!,
    maximumScalePosition: positions.at(-1)!,
    sourceCount: positions.length,
  };
}

function parseScale(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) &&
    parsed.every((entry) => typeof entry === "string")
    ? parsed
    : [];
}
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
