import type Database from "better-sqlite3";

export interface CatalogPruneResult {
  releasesDeleted: number;
  sourceRunsDeleted: number;
  factRowsDeleted: number;
}

export function pruneInactiveCatalogHistory(
  sqlite: Database.Database,
  keepInactiveReleases: number,
): CatalogPruneResult {
  if (
    !Number.isSafeInteger(keepInactiveReleases) ||
    keepInactiveReleases < 0 ||
    keepInactiveReleases > 100_000
  ) {
    throw new Error(
      "Catalog release history limit must be an integer between 0 and 100000",
    );
  }
  return sqlite.transaction(() => {
    const inactiveReleases = sqlite
      .prepare(
        `
      select id from catalog_releases where active = 0
      order by promoted_at desc, created_at desc, rowid desc
    `,
      )
      .all() as Array<{ id: string }>;
    const deleteRelease = sqlite.prepare(
      "delete from catalog_releases where id = ? and active = 0",
    );
    let releasesDeleted = 0;
    for (const { id } of inactiveReleases.slice(keepInactiveReleases))
      releasesDeleted += deleteRelease.run(id).changes;

    const removableRuns = sqlite
      .prepare(
        `
      select run.id from source_runs run
      where run.status != 'active'
        and not exists (select 1 from catalog_release_sources member where member.source_run_id = run.id)
        and not exists (select 1 from ingestion_conflicts conflict where conflict.source_run_id = run.id)
      order by run.retrieved_at, run.id
    `,
      )
      .all() as Array<{ id: string }>;
    const statements = [
      sqlite.prepare(
        "delete from cyclic_reward_choices where schedule_id in (select id from cyclic_reward_schedules where source_run_id = ?)",
      ),
      sqlite.prepare(
        "delete from cyclic_reward_schedules where source_run_id = ?",
      ),
      sqlite.prepare(
        "delete from editorial_rankings where set_id in (select id from ranking_sets where source_run_id = ?)",
      ),
      sqlite.prepare("delete from ranking_sets where source_run_id = ?"),
      sqlite.prepare(
        "delete from recipe_ingredients where recipe_id in (select id from recipes where source_run_id = ?)",
      ),
      sqlite.prepare("delete from recipes where source_run_id = ?"),
      sqlite.prepare("delete from drops where source_run_id = ?"),
      sqlite.prepare("delete from relic_rewards where source_run_id = ?"),
      sqlite.prepare("delete from vendor_offerings where source_run_id = ?"),
      sqlite.prepare("delete from node_details where source_run_id = ?"),
      sqlite.prepare(
        "delete from node_item_requirements where source_run_id = ?",
      ),
      sqlite.prepare("delete from node_objectives where source_run_id = ?"),
      sqlite.prepare("delete from node_rewards where source_run_id = ?"),
      sqlite.prepare("delete from entity_relations where source_run_id = ?"),
      sqlite.prepare("delete from entity_attributes where source_run_id = ?"),
      sqlite.prepare(
        "delete from entity_enhancement_options where source_run_id = ?",
      ),
      sqlite.prepare(
        "delete from equipment_polarity_sets where source_run_id = ?",
      ),
      sqlite.prepare("delete from fact_provenance where source_run_id = ?"),
    ];
    const detachRefresh = sqlite.prepare(
      "update source_refreshes set source_run_id = null where source_run_id = ?",
    );
    const deleteRun = sqlite.prepare(
      "delete from source_runs where id = ? and status != 'active'",
    );
    let factRowsDeleted = 0;
    let sourceRunsDeleted = 0;
    for (const { id } of removableRuns) {
      for (const statement of statements)
        factRowsDeleted += statement.run(id).changes;
      detachRefresh.run(id);
      sourceRunsDeleted += deleteRun.run(id).changes;
    }
    return { releasesDeleted, sourceRunsDeleted, factRowsDeleted };
  })();
}
