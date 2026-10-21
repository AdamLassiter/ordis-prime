import type {
  AdversaryKind,
  ArcaneClass,
  EquipmentPolarity,
  ModPolarity,
  WeaponClass,
} from "@ordis-prime/domain";
import type Database from "better-sqlite3";

export interface CatalogSummary {
  kind: string;
  slug: string;
  name: string;
  description?: string;
  arcaneClass?: ArcaneClass;
  weaponClass?: WeaponClass;
  equipmentMaxRank?: number;
  modMaxRank?: number;
  modBaseDrain?: number;
  modPolarity?: ModPolarity;
}
export const DISCOVERY_KINDS = [
  "quest",
  "mechanic",
  "secret",
  "enemy",
  "boss",
  "ability",
] as const;
export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number];
export interface DiscoveryCatalogEntry extends CatalogSummary {
  progressState?: "unseen" | "discovered" | "completed";
  relationCount: number;
  neighbors: Array<{
    direction: "outgoing" | "incoming";
    relationKind: string;
    kind: string;
    slug: string;
    name: string;
    sourceName: string;
    citationUrl?: string;
  }>;
}

export interface CatalogItem extends CatalogSummary {
  factoryPolaritySets: CatalogEquipmentPolaritySet[];
  components: Array<{
    kind: string;
    slug: string;
    name: string;
    quantity: number;
  }>;
  drops: Array<{
    nodeSlug?: string;
    node: string;
    chance?: number;
    rotation?: string;
  }>;
  requiredForNodeAccess: Array<{
    nodeSlug: string;
    nodeName: string;
    quantity: number;
    sourceName: string;
    citationUrl?: string;
  }>;
  junctionRewards: Array<{
    nodeSlug: string;
    nodeName: string;
    label: string;
    quantity?: number;
    trigger: "objective" | "junction-completion";
    sourceName: string;
    citationUrl?: string;
  }>;
  sources: Array<{ name: string; homepage: string }>;
  rankings: Array<{
    title: string;
    author: string;
    tier: string;
    timestampSeconds?: number;
    sourceUrl: string;
  }>;
  enhancementOptions: Array<{
    key: string;
    label: string;
    sourceName: string;
    citationUrl?: string;
  }>;
  relations: Array<{
    direction: "outgoing" | "incoming";
    kind: string;
    subject: CatalogSummary;
    notes?: string;
    sourceName: string;
    citationUrl?: string;
  }>;
  evidence: Array<{
    fact: string;
    sourceName: string;
    version: string;
    recordKey?: string;
    citationUrl?: string;
    sourcePath?: string;
    snapshotPath?: string;
  }>;
}

export interface CatalogEquipmentPolaritySet {
  configuration?: string;
  polarities: EquipmentPolarity[];
  sourceName: string;
  citationUrl?: string;
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
  railjackIntrinsicRequirement?: number;
  warframeRankRequirement?: number;
  activeAdversaryRequirement?: AdversaryKind;
  completionState?: "incomplete" | "completed";
  detailEvidence: Array<{
    sourceName: string;
    version: string;
    recordKey: string;
    sourcePath?: string;
    citationUrl?: string;
  }>;
  connections: Array<{ slug: string; name: string; planet?: string }>;
  accessRequirements: Array<{
    kind: string;
    slug: string;
    name: string;
    relationKind: "requires" | "unlocks";
    sourceName: string;
    citationUrl?: string;
    progressState?: "unseen" | "discovered" | "incomplete" | "completed";
  }>;
  itemRequirements: Array<{
    kind: string;
    slug: string;
    name: string;
    requiredCount: number;
    ownedCount?: number;
    state?: "met" | "blocked";
    sourceName: string;
    citationUrl?: string;
  }>;
  objectives: Array<{
    sourceId: string;
    key: string;
    label: string;
    hint?: string;
    sourceName: string;
    citationUrl?: string;
    completionState?: "incomplete" | "completed";
  }>;
  oneTimeRewards: Array<{
    key: string;
    label: string;
    quantity?: number;
    trigger: "objective" | "junction-completion";
    objectiveKey?: string;
    sortOrder: number;
    sourceName: string;
    citationUrl?: string;
    entity?: CatalogSummary;
  }>;
  drops: Array<{
    kind: string;
    slug: string;
    name: string;
    chance?: number;
    rotation?: string;
    inventory?: {
      ownedCount: number;
      builtCount: number;
      wantedCount: number;
      needed: boolean;
    };
  }>;
}

export interface StarChartNode extends Omit<CatalogNode, "drops" | "id"> {
  rewardCount: number;
  connectionCount: number;
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
  observationCount?: number | null;
  conflictCount: number;
  latestRefreshStatus?: "running" | "succeeded" | "failed";
  latestRefreshStartedAt?: number;
  latestRefreshFinishedAt?: number;
}

export function searchCatalog(
  sqlite: Database.Database,
  query = "",
  limit = 100,
): CatalogSummary[] {
  const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const pattern = `%${escapeLike(query.trim())}%`;
  return sqlite
    .prepare(
      `
    select kind, slug, name, description
    from entities
    where retired = 0 and name like ? escape '\\'
    order by case when lower(name) = lower(?) then 0 else 1 end, name collate nocase, kind
    limit ?
  `,
    )
    .all(pattern, query.trim(), normalizedLimit) as CatalogSummary[];
}

export function searchDiscoveryCatalog(
  sqlite: Database.Database,
  input: {
    query?: string;
    kind?: DiscoveryKind;
    progress?: "unseen" | "discovered" | "completed";
    userId?: string;
    limit?: number;
  } = {},
): DiscoveryCatalogEntry[] {
  if (
    input.kind &&
    !(DISCOVERY_KINDS as readonly string[]).includes(input.kind)
  )
    throw new Error("Discovery kind is invalid");
  if (input.progress && !input.userId)
    throw new Error("Discovery progress filters require a user");
  const normalizedLimit = Math.max(
    1,
    Math.min(500, Math.trunc(input.limit ?? 200)),
  );
  const pattern = `%${escapeLike(input.query?.trim() ?? "")}%`;
  const kindPlaceholders = DISCOVERY_KINDS.map(() => "?").join(", ");
  const progressJoin = input.userId
    ? "left join player_discovery_progress progress on progress.entity_id = entity.id and progress.user_id = ?"
    : "";
  const progressColumn = input.userId
    ? "coalesce(progress.state, 'unseen') as progressState"
    : "null as progressState";
  const progressWhere = input.progress
    ? "and coalesce(progress.state, 'unseen') = ?"
    : "";
  const entries = sqlite
    .prepare(
      `
    select entity.id as entityId, entity.kind, entity.slug, entity.name, entity.description, ${progressColumn},
      (select count(*) from entity_relations relation join source_runs relation_run on relation_run.id = relation.source_run_id and relation_run.status = 'active'
       where relation.from_entity_id = entity.id or relation.to_entity_id = entity.id) as relationCount
    from entities entity
    ${progressJoin}
    where entity.retired = 0 and entity.kind in (${kindPlaceholders})
      and (? is null or entity.kind = ?) and entity.name like ? escape '\\' ${progressWhere}
    order by case entity.kind when 'quest' then 0 when 'mechanic' then 1 when 'secret' then 2 when 'boss' then 3 else 4 end,
      entity.name collate nocase limit ?
  `,
    )
    .all(
      ...(input.userId ? [input.userId] : []),
      ...DISCOVERY_KINDS,
      input.kind ?? null,
      input.kind ?? null,
      pattern,
      ...(input.progress ? [input.progress] : []),
      normalizedLimit,
    ) as Array<Omit<DiscoveryCatalogEntry, "neighbors"> & { entityId: string }>;
  const neighbors = loadDiscoveryNeighbors(
    sqlite,
    entries.map(({ entityId }) => entityId),
  );
  return entries.map(({ entityId, ...entry }) => ({
    ...entry,
    neighbors: neighbors.get(entityId) ?? [],
  }));
}

function loadDiscoveryNeighbors(
  sqlite: Database.Database,
  entityIds: string[],
): Map<string, DiscoveryCatalogEntry["neighbors"]> {
  const result = new Map<string, DiscoveryCatalogEntry["neighbors"]>();
  if (!entityIds.length) return result;
  for (let offset = 0; offset < entityIds.length; offset += 400) {
    const chunk = entityIds.slice(offset, offset + 400);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = sqlite
      .prepare(
        `
    with neighbor_candidates as (
      select relation.from_entity_id as ownerId, 'outgoing' as direction,
        relation.kind as relationKind, target.kind, target.slug, target.name,
        source.name as sourceName, relation.citation_url as citationUrl
      from entity_relations relation
      join source_runs run on run.id = relation.source_run_id and run.status = 'active'
      join sources source on source.id = run.source_id
      join entities target on target.id = relation.to_entity_id and target.retired = 0
      where relation.from_entity_id in (${placeholders})
      union all
      select relation.to_entity_id, 'incoming', relation.kind, origin.kind,
        origin.slug, origin.name, source.name, relation.citation_url
      from entity_relations relation
      join source_runs run on run.id = relation.source_run_id and run.status = 'active'
      join sources source on source.id = run.source_id
      join entities origin on origin.id = relation.from_entity_id and origin.retired = 0
      where relation.to_entity_id in (${placeholders})
    ), ranked as (
      select *, row_number() over (
        partition by ownerId order by relationKind, name collate nocase, kind, slug
      ) as neighborPosition
      from neighbor_candidates
    )
    select ownerId, direction, relationKind, kind, slug, name, sourceName, citationUrl
    from ranked where neighborPosition <= 3
    order by ownerId, neighborPosition
  `,
      )
      .all(...chunk, ...chunk) as Array<{
      ownerId: string;
      direction: "outgoing" | "incoming";
      relationKind: string;
      kind: string;
      slug: string;
      name: string;
      sourceName: string;
      citationUrl: string | null;
    }>;
    for (const { ownerId, citationUrl, ...neighbor } of rows) {
      result.set(ownerId, [
        ...(result.get(ownerId) ?? []),
        { ...neighbor, citationUrl: citationUrl ?? undefined },
      ]);
    }
  }
  return result;
}

export function findCatalogItem(
  sqlite: Database.Database,
  kind: string,
  slug: string,
): CatalogItem | undefined {
  const item = sqlite
    .prepare(
      "select id, kind, slug, name, description, arcane_class as arcaneClass, weapon_class as weaponClass, equipment_max_rank as equipmentMaxRank, mod_max_rank as modMaxRank, mod_base_drain as modBaseDrain, mod_polarity as modPolarity from entities where kind = ? and slug = ? and retired = 0",
    )
    .get(kind, slug) as
    | (CatalogSummary & {
        id: string;
        arcaneClass: ArcaneClass | null;
        weaponClass: WeaponClass | null;
        equipmentMaxRank: number | null;
        modMaxRank: number | null;
        modBaseDrain: number | null;
        modPolarity: ModPolarity | null;
      })
    | undefined;
  if (!item) return undefined;

  const factoryPolaritySets = listEquipmentPolaritySetsByEntityId(
    sqlite,
    item.id,
  );

  const components = sqlite
    .prepare(
      `
    select distinct ingredient.kind, ingredient.slug, ingredient.name, ri.quantity
    from recipes r
    join source_runs run on run.id = r.source_run_id and run.status = 'active'
    join recipe_ingredients ri on ri.recipe_id = r.id
    join entities ingredient on ingredient.id = ri.entity_id
    where r.output_id = ? and ingredient.retired = 0
    order by ingredient.name collate nocase
  `,
    )
    .all(item.id) as CatalogItem["components"];
  const drops = sqlite
    .prepare(
      `
    select node.slug as nodeSlug, d.location_label as node, d.chance, d.rotation
    from drops d
    join source_runs run on run.id = d.source_run_id and run.status = 'active'
    left join entities node on node.id = d.node_id and node.retired = 0
    where d.reward_id = ?
    order by d.location_label collate nocase, d.rotation
  `,
    )
    .all(item.id) as CatalogItem["drops"];
  const requiredForNodeAccess = sqlite
    .prepare(
      `select node.slug as nodeSlug, node.name as nodeName,
              requirement.quantity, source.name as sourceName,
              requirement.citation_url as citationUrl
       from node_item_requirements requirement
       join source_runs run on run.id = requirement.source_run_id and run.status = 'active'
       join sources source on source.id = run.source_id
       join entities node on node.id = requirement.node_id and node.retired = 0
       where requirement.item_id = ?
       order by node.name collate nocase, source.priority desc,
                run.retrieved_at desc, source.id, requirement.source_record_key`,
    )
    .all(item.id)
    .map((row) => {
      const requirement = row as {
        nodeSlug: string;
        nodeName: string;
        quantity: number;
        sourceName: string;
        citationUrl: string | null;
      };
      return {
        ...requirement,
        citationUrl: requirement.citationUrl ?? undefined,
      };
    });
  const junctionRewards = sqlite
    .prepare(
      `select node.slug as nodeSlug, node.name as nodeName, reward.label,
              reward.quantity, reward.trigger, source.name as sourceName,
              reward.citation_url as citationUrl
       from node_rewards reward
       join source_runs run on run.id = reward.source_run_id and run.status = 'active'
       join sources source on source.id = run.source_id
       join entities node on node.id = reward.node_id and node.retired = 0
       where reward.reward_entity_id = ?
       order by node.name collate nocase, reward.sort_order,
                reward.source_record_key`,
    )
    .all(item.id)
    .map((row) => {
      const reward = row as {
        nodeSlug: string;
        nodeName: string;
        label: string;
        quantity: number | null;
        trigger: "objective" | "junction-completion";
        sourceName: string;
        citationUrl: string | null;
      };
      return {
        ...reward,
        quantity: reward.quantity ?? undefined,
        citationUrl: reward.citationUrl ?? undefined,
      };
    });
  const sources = sqlite
    .prepare(
      `
    select distinct source.name, source.homepage
    from fact_provenance provenance
    join source_runs run on run.id = provenance.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where provenance.entity_id = ?
    order by source.priority desc, source.name
  `,
    )
    .all(item.id) as CatalogItem["sources"];
  const rankings = sqlite
    .prepare(
      `
    select ranking_set.title, ranking_set.author, ranking.tier,
           ranking.timestamp_seconds as timestampSeconds, source.homepage as sourceUrl
    from editorial_rankings ranking
    join ranking_sets ranking_set on ranking_set.id = ranking.set_id
    join source_runs run on run.id = ranking_set.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where ranking.entity_id = ?
    order by ranking_set.published_at desc, ranking_set.title
  `,
    )
    .all(item.id) as CatalogItem["rankings"];
  const enhancementOptions = sqlite
    .prepare(
      `
    with ranked as (
      select option.key, option.label, source.name as sourceName, option.citation_url as citationUrl,
        row_number() over (
          partition by option.key
          order by source.priority desc, run.retrieved_at desc, source.id, option.source_record_key, option.id
        ) as preference
      from entity_enhancement_options option
      join source_runs run on run.id = option.source_run_id and run.status = 'active'
      join sources source on source.id = run.source_id
      where option.entity_id = ?
    )
    select key, label, sourceName, citationUrl from ranked where preference = 1 order by label collate nocase, key
  `,
    )
    .all(item.id)
    .map((row) => {
      const option = row as {
        key: string;
        label: string;
        sourceName: string;
        citationUrl: string | null;
      };
      return { ...option, citationUrl: option.citationUrl ?? undefined };
    });
  const relations = sqlite
    .prepare(
      `
    select 'outgoing' as direction, relation.kind, target.kind as subjectKind, target.slug as subjectSlug,
      target.name as subjectName, target.description as subjectDescription, relation.notes,
      source.name as sourceName, relation.citation_url as citationUrl
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    join entities target on target.id = relation.to_entity_id and target.retired = 0
    where relation.from_entity_id = ?
    union all
    select 'incoming', relation.kind, origin.kind, origin.slug, origin.name, origin.description,
      relation.notes, source.name, relation.citation_url
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    join entities origin on origin.id = relation.from_entity_id and origin.retired = 0
    where relation.to_entity_id = ?
    order by 1 desc, 2, 5 collate nocase
  `,
    )
    .all(item.id, item.id) as Array<{
    direction: "outgoing" | "incoming";
    kind: string;
    subjectKind: string;
    subjectSlug: string;
    subjectName: string;
    subjectDescription?: string;
    notes?: string;
    sourceName: string;
    citationUrl?: string;
  }>;
  const evidence = sqlite
    .prepare(
      `
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
    union all
    select 'enhancement-option.' || option.key as fact, source.name, run.version, option.source_record_key,
           option.citation_url, option.source_path, run.snapshot_path
    from entity_enhancement_options option
    join source_runs run on run.id = option.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where option.entity_id = ?
    union all
    select 'factory-polarity-set' as fact, source.name, run.version, polarity.source_record_key,
           polarity.citation_url, polarity.source_path, run.snapshot_path
    from equipment_polarity_sets polarity
    join source_runs run on run.id = polarity.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where polarity.entity_id = ?
    union all
    select 'node-item-requirement' as fact, source.name, run.version, requirement.source_record_key,
           requirement.citation_url, requirement.source_path, run.snapshot_path
    from node_item_requirements requirement
    join source_runs run on run.id = requirement.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where requirement.item_id = ?
    union all
    select 'node-reward' as fact, source.name, run.version, reward.source_record_key,
           reward.citation_url, reward.source_path, run.snapshot_path
    from node_rewards reward
    join source_runs run on run.id = reward.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where reward.reward_entity_id = ?
    union all
    select 'relation.' || relation.kind as fact, source.name, run.version, relation.source_record_key,
           relation.citation_url, relation.source_path, run.snapshot_path
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where relation.from_entity_id = ? or relation.to_entity_id = ?
    order by sourceName, fact, recordKey
  `,
    )
    .all(
      item.id,
      item.id,
      item.id,
      item.id,
      item.id,
      item.id,
      item.id,
      item.id,
      item.id,
      item.id,
    ) as Array<{
    fact: string;
    sourceName: string;
    version: string;
    recordKey?: string;
    citationUrl?: string;
    sourcePath?: string;
    snapshotPath?: string;
  }>;
  const {
    id: _id,
    arcaneClass,
    weaponClass,
    equipmentMaxRank,
    modMaxRank,
    modBaseDrain,
    modPolarity,
    ...summary
  } = item;
  return {
    ...summary,
    ...(arcaneClass ? { arcaneClass } : {}),
    ...(weaponClass ? { weaponClass } : {}),
    ...(equipmentMaxRank !== null ? { equipmentMaxRank } : {}),
    ...(modMaxRank !== null ? { modMaxRank } : {}),
    ...(modBaseDrain !== null ? { modBaseDrain } : {}),
    ...(modPolarity ? { modPolarity } : {}),
    factoryPolaritySets,
    components,
    drops,
    requiredForNodeAccess,
    junctionRewards,
    sources,
    rankings,
    enhancementOptions,
    relations: relations.map(
      ({
        subjectKind,
        subjectSlug,
        subjectName,
        subjectDescription,
        ...relation
      }) => ({
        ...relation,
        subject: {
          kind: subjectKind,
          slug: subjectSlug,
          name: subjectName,
          description: subjectDescription,
        },
      }),
    ),
    evidence,
  };
}

export function listEquipmentPolaritySetsByEntityId(
  sqlite: Database.Database,
  entityId: string,
): CatalogEquipmentPolaritySet[] {
  const rows = sqlite
    .prepare(
      `select polarity.configuration, polarity.polarities_json as polaritiesJson,
              source.name as sourceName, polarity.citation_url as citationUrl
       from equipment_polarity_sets polarity
       join source_runs run on run.id = polarity.source_run_id and run.status = 'active'
       join sources source on source.id = run.source_id
       where polarity.entity_id = ?
       order by source.priority desc, run.retrieved_at desc, source.id,
                coalesce(polarity.configuration, ''), polarity.source_record_key, polarity.id`,
    )
    .all(entityId) as Array<{
    configuration: string | null;
    polaritiesJson: string;
    sourceName: string;
    citationUrl: string | null;
  }>;
  return rows.map((row) => ({
    ...(row.configuration ? { configuration: row.configuration } : {}),
    polarities: JSON.parse(row.polaritiesJson) as EquipmentPolarity[],
    sourceName: row.sourceName,
    citationUrl: row.citationUrl ?? undefined,
  }));
}

export function findCatalogNode(
  sqlite: Database.Database,
  slug: string,
  userId?: string,
): CatalogNode | undefined {
  const node = sqlite
    .prepare(
      "select id, slug, name, description from entities where kind = 'node' and slug = ? and retired = 0",
    )
    .get(slug) as
    | { id: string; slug: string; name: string; description?: string }
    | undefined;
  if (!node) return undefined;
  const inventoryJoin = userId
    ? "left join player_inventory inventory on inventory.entity_id = reward.id and inventory.user_id = ?"
    : "";
  const inventoryColumns = userId
    ? ", coalesce(inventory.owned_count, 0) as ownedCount, coalesce(inventory.built_count, 0) as builtCount, coalesce(inventory.wanted_count, 0) as wantedCount"
    : "";
  const rows = sqlite
    .prepare(
      `
    select reward.kind, reward.slug, reward.name, d.chance, d.rotation${inventoryColumns}
    from drops d
    join source_runs run on run.id = d.source_run_id and run.status = 'active'
    join entities reward on reward.id = d.reward_id and reward.retired = 0
    ${inventoryJoin}
    where d.node_id = ?
    order by reward.name collate nocase, d.rotation
  `,
    )
    .all(...(userId ? [userId, node.id] : [node.id])) as Array<
    Omit<CatalogNode["drops"][number], "inventory"> & {
      ownedCount?: number;
      builtCount?: number;
      wantedCount?: number;
    }
  >;
  const drops = rows.map(
    ({ ownedCount, builtCount, wantedCount, ...drop }) => ({
      ...drop,
      ...(userId
        ? {
            inventory: {
              ownedCount: ownedCount ?? 0,
              builtCount: builtCount ?? 0,
              wantedCount: wantedCount ?? 0,
              needed:
                (ownedCount ?? 0) + (builtCount ?? 0) === 0 ||
                (wantedCount ?? 0) > 0,
            },
          }
        : {}),
    }),
  );
  const details = loadNodeDetails(sqlite, [node.id]).get(node.id);
  const connections = loadNodeConnections(sqlite, [node.id]).get(node.id) ?? [];
  const accessRequirements =
    loadNodeAccessRequirements(sqlite, [node.id], userId).get(node.id) ?? [];
  const itemRequirements =
    loadNodeItemRequirements(sqlite, [node.id], userId).get(node.id) ?? [];
  const objectives =
    loadNodeObjectives(sqlite, [node.id], userId).get(node.id) ?? [];
  const oneTimeRewards = loadNodeRewards(sqlite, [node.id]).get(node.id) ?? [];
  const completionState = userId
    ? loadNodeCompletionStates(sqlite, [node.id], userId).get(node.id)
    : undefined;
  const { id: _id, ...summary } = node;
  return {
    ...summary,
    ...details,
    detailEvidence: details?.detailEvidence ?? [],
    connections,
    accessRequirements,
    itemRequirements,
    objectives,
    oneTimeRewards,
    ...(completionState ? { completionState } : {}),
    drops,
  };
}

export function listCatalogNodes(
  sqlite: Database.Database,
  limit = 500,
): CatalogNode[] {
  const normalizedLimit = Math.max(1, Math.min(2_000, Math.trunc(limit)));
  const nodes = sqlite
    .prepare(
      "select id, slug, name, description from entities where kind = 'node' and retired = 0 order by name collate nocase limit ?",
    )
    .all(normalizedLimit) as Array<{
    id: string;
    slug: string;
    name: string;
    description?: string;
  }>;
  const details = loadNodeDetails(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const connections = loadNodeConnections(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const accessRequirements = loadNodeAccessRequirements(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const itemRequirements = loadNodeItemRequirements(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const objectives = loadNodeObjectives(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const oneTimeRewards = loadNodeRewards(
    sqlite,
    nodes.map(({ id }) => id),
  );
  return nodes.map(({ id, ...node }) => ({
    ...node,
    ...details.get(id),
    detailEvidence: details.get(id)?.detailEvidence ?? [],
    connections: connections.get(id) ?? [],
    accessRequirements: accessRequirements.get(id) ?? [],
    itemRequirements: itemRequirements.get(id) ?? [],
    objectives: objectives.get(id) ?? [],
    oneTimeRewards: oneTimeRewards.get(id) ?? [],
    drops: [],
  }));
}

export function listStarChartNodes(
  sqlite: Database.Database,
  userId?: string,
): StarChartNode[] {
  const nodes = sqlite
    .prepare(
      "select id, slug, name, description from entities where kind = 'node' and retired = 0 order by name collate nocase",
    )
    .all() as Array<{
    id: string;
    slug: string;
    name: string;
    description?: string;
  }>;
  const details = loadNodeDetails(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const connections = loadNodeConnections(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const accessRequirements = loadNodeAccessRequirements(
    sqlite,
    nodes.map(({ id }) => id),
    userId,
  );
  const itemRequirements = loadNodeItemRequirements(
    sqlite,
    nodes.map(({ id }) => id),
    userId,
  );
  const objectives = loadNodeObjectives(
    sqlite,
    nodes.map(({ id }) => id),
    userId,
  );
  const oneTimeRewards = loadNodeRewards(
    sqlite,
    nodes.map(({ id }) => id),
  );
  const completionStates = userId
    ? loadNodeCompletionStates(
        sqlite,
        nodes.map(({ id }) => id),
        userId,
      )
    : undefined;
  const inventoryColumns = userId
    ? `coalesce(inventory.owned_count, 0) as ownedCount,
      coalesce(inventory.built_count, 0) as builtCount,
      coalesce(inventory.wanted_count, 0) as wantedCount`
    : "0 as ownedCount, 0 as builtCount, 0 as wantedCount";
  const rewards = sqlite
    .prepare(
      `
    select distinct item_drop.node_id as nodeId, item_drop.reward_id as rewardId,
      ${inventoryColumns}
    from drops item_drop join source_runs run on run.id = item_drop.source_run_id and run.status = 'active'
    ${userId ? "left join player_inventory inventory on inventory.entity_id = item_drop.reward_id and inventory.user_id = ?" : ""}
    where item_drop.node_id is not null
  `,
    )
    .all(...(userId ? [userId] : [])) as Array<{
    nodeId: string;
    rewardId: string;
    ownedCount: number;
    builtCount: number;
    wantedCount: number;
  }>;
  const counts = new Map<
    string,
    { rewardCount: number; neededRewardCount: number }
  >();
  for (const reward of rewards) {
    const count = counts.get(reward.nodeId) ?? {
      rewardCount: 0,
      neededRewardCount: 0,
    };
    count.rewardCount += 1;
    if (
      userId &&
      (reward.ownedCount + reward.builtCount === 0 || reward.wantedCount > 0)
    )
      count.neededRewardCount += 1;
    counts.set(reward.nodeId, count);
  }
  return nodes.map(({ id, ...node }) => ({
    ...node,
    ...details.get(id),
    detailEvidence: details.get(id)?.detailEvidence ?? [],
    connections: connections.get(id) ?? [],
    accessRequirements: accessRequirements.get(id) ?? [],
    itemRequirements: itemRequirements.get(id) ?? [],
    objectives: objectives.get(id) ?? [],
    oneTimeRewards: oneTimeRewards.get(id) ?? [],
    ...(completionStates
      ? { completionState: completionStates.get(id) ?? "incomplete" }
      : {}),
    connectionCount: connections.get(id)?.length ?? 0,
    rewardCount: counts.get(id)?.rewardCount ?? 0,
    ...(userId
      ? { neededRewardCount: counts.get(id)?.neededRewardCount ?? 0 }
      : {}),
  }));
}

function loadNodeCompletionStates(
  sqlite: Database.Database,
  nodeIds: string[],
  userId: string,
): Map<string, "incomplete" | "completed"> {
  if (!nodeIds.length) return new Map();
  const placeholders = nodeIds.map(() => "?").join(", ");
  const completed = new Set(
    (
      sqlite
        .prepare(
          `select node_id as nodeId from player_node_progress
           where user_id = ? and node_id in (${placeholders})`,
        )
        .all(userId, ...nodeIds) as Array<{ nodeId: string }>
    ).map(({ nodeId }) => nodeId),
  );
  return new Map(
    nodeIds.map((nodeId) => [
      nodeId,
      completed.has(nodeId) ? "completed" : "incomplete",
    ]),
  );
}

function loadNodeAccessRequirements(
  sqlite: Database.Database,
  nodeIds: string[],
  userId?: string,
): Map<string, CatalogNode["accessRequirements"]> {
  const result = new Map<string, CatalogNode["accessRequirements"]>();
  if (!nodeIds.length) return result;
  const placeholders = nodeIds.map(() => "?").join(", ");
  const progressJoin = userId
    ? `left join player_discovery_progress discovery_progress
         on discovery_progress.entity_id = prerequisite.id and prerequisite.kind <> 'node'
        and discovery_progress.user_id = ?
       left join player_node_progress node_progress
         on node_progress.node_id = prerequisite.id and prerequisite.kind = 'node'
        and node_progress.user_id = ?`
    : "";
  const progressColumn = userId
    ? `, case when prerequisite.kind = 'node'
          then case when node_progress.node_id is null then 'incomplete' else 'completed' end
          else coalesce(discovery_progress.state, 'unseen') end as progressState`
    : ", null as progressState";
  const rows = sqlite
    .prepare(
      `
    select relation.from_entity_id as nodeId, prerequisite.kind, prerequisite.slug,
      prerequisite.name, 'requires' as relationKind, source.name as sourceName,
      relation.citation_url as citationUrl${progressColumn}
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    join entities prerequisite on prerequisite.id = relation.to_entity_id and prerequisite.retired = 0
    ${progressJoin}
    where relation.kind = 'requires' and relation.from_entity_id in (${placeholders})
    union all
    select relation.to_entity_id, prerequisite.kind, prerequisite.slug,
      prerequisite.name, 'unlocks', source.name, relation.citation_url${progressColumn}
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    join entities prerequisite on prerequisite.id = relation.from_entity_id and prerequisite.retired = 0
    ${progressJoin}
    where relation.kind = 'unlocks' and relation.to_entity_id in (${placeholders})
    order by 1, 4 collate nocase, 2, 3, 5, 6
  `,
    )
    .all(
      ...(userId ? [userId, userId] : []),
      ...nodeIds,
      ...(userId ? [userId, userId] : []),
      ...nodeIds,
    ) as Array<
    Omit<
      { nodeId: string } & CatalogNode["accessRequirements"][number],
      "progressState"
    > & {
      progressState:
        "unseen" | "discovered" | "incomplete" | "completed" | null;
    }
  >;
  for (const { nodeId, progressState, ...requirement } of rows) {
    const requirements = result.get(nodeId) ?? [];
    requirements.push({
      ...requirement,
      ...(progressState ? { progressState } : {}),
    });
    result.set(nodeId, requirements);
  }
  return result;
}

function loadNodeItemRequirements(
  sqlite: Database.Database,
  nodeIds: string[],
  userId?: string,
): Map<string, CatalogNode["itemRequirements"]> {
  const result = new Map<string, CatalogNode["itemRequirements"]>();
  if (!nodeIds.length) return result;
  const placeholders = nodeIds.map(() => "?").join(", ");
  const inventoryJoin = userId
    ? `left join player_inventory inventory
         on inventory.entity_id = item.id and inventory.user_id = ?`
    : "";
  const inventoryColumn = userId
    ? "coalesce(inventory.owned_count, 0) + coalesce(inventory.built_count, 0) as ownedCount"
    : "null as ownedCount";
  const rows = sqlite
    .prepare(
      `select requirement.node_id as nodeId, item.kind, item.slug, item.name,
              requirement.quantity as requiredCount, ${inventoryColumn},
              source.name as sourceName, requirement.citation_url as citationUrl
       from node_item_requirements requirement
       join source_runs run on run.id = requirement.source_run_id and run.status = 'active'
       join sources source on source.id = run.source_id
       join entities item on item.id = requirement.item_id and item.retired = 0
       ${inventoryJoin}
       where requirement.node_id in (${placeholders})
       order by requirement.node_id, item.name collate nocase, source.priority desc,
                run.retrieved_at desc, source.id, requirement.source_record_key`,
    )
    .all(...(userId ? [userId] : []), ...nodeIds) as Array<{
    nodeId: string;
    kind: string;
    slug: string;
    name: string;
    requiredCount: number;
    ownedCount: number | null;
    sourceName: string;
    citationUrl: string | null;
  }>;
  for (const { nodeId, ownedCount, citationUrl, ...requirement } of rows) {
    const requirements = result.get(nodeId) ?? [];
    requirements.push({
      ...requirement,
      ...(ownedCount === null
        ? {}
        : {
            ownedCount,
            state:
              ownedCount >= requirement.requiredCount
                ? ("met" as const)
                : ("blocked" as const),
          }),
      citationUrl: citationUrl ?? undefined,
    });
    result.set(nodeId, requirements);
  }
  return result;
}

function loadNodeObjectives(
  sqlite: Database.Database,
  nodeIds: string[],
  userId?: string,
): Map<string, CatalogNode["objectives"]> {
  const result = new Map<string, CatalogNode["objectives"]>();
  if (!nodeIds.length) return result;
  const placeholders = nodeIds.map(() => "?").join(", ");
  const progressJoin = userId
    ? `left join player_node_objective_progress progress
         on progress.user_id = ? and progress.node_id = objective.node_id
        and progress.source_id = run.source_id
        and progress.objective_key = objective.key`
    : "";
  const progressColumn = userId
    ? ", case when progress.objective_key is null then 'incomplete' else 'completed' end as completionState"
    : ", null as completionState";
  const rows = sqlite
    .prepare(
      `select objective.node_id as nodeId, objective.key, objective.label,
              objective.hint, source.id as sourceId, source.name as sourceName,
              objective.citation_url as citationUrl${progressColumn}
       from node_objectives objective
       join source_runs run on run.id = objective.source_run_id and run.status = 'active'
       join sources source on source.id = run.source_id
       ${progressJoin}
       where objective.node_id in (${placeholders})
       order by objective.node_id, source.priority desc, run.retrieved_at desc,
                source.id, objective.sort_order, objective.source_record_key`,
    )
    .all(...(userId ? [userId, ...nodeIds] : nodeIds)) as Array<{
    nodeId: string;
    sourceId: string;
    key: string;
    label: string;
    hint: string | null;
    sourceName: string;
    citationUrl: string | null;
    completionState: "incomplete" | "completed" | null;
  }>;
  for (const {
    nodeId,
    hint,
    citationUrl,
    completionState,
    ...objective
  } of rows) {
    const objectives = result.get(nodeId) ?? [];
    objectives.push({
      ...objective,
      hint: hint ?? undefined,
      citationUrl: citationUrl ?? undefined,
      ...(completionState ? { completionState } : {}),
    });
    result.set(nodeId, objectives);
  }
  return result;
}

function loadNodeRewards(
  sqlite: Database.Database,
  nodeIds: string[],
): Map<string, CatalogNode["oneTimeRewards"]> {
  const result = new Map<string, CatalogNode["oneTimeRewards"]>();
  if (!nodeIds.length) return result;
  const placeholders = nodeIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `select reward.node_id as nodeId, reward.key, reward.label,
              reward.quantity, reward.trigger,
              reward.objective_key as objectiveKey,
              reward.sort_order as sortOrder, source.name as sourceName,
              reward.citation_url as citationUrl,
              entity.kind as entityKind, entity.slug as entitySlug,
              entity.name as entityName, entity.description as entityDescription
       from node_rewards reward
       join source_runs run on run.id = reward.source_run_id and run.status = 'active'
       join sources source on source.id = run.source_id
       left join entities entity
         on entity.id = reward.reward_entity_id and entity.retired = 0
       where reward.node_id in (${placeholders})
       order by reward.node_id, reward.sort_order,
                source.priority desc, run.retrieved_at desc, source.id,
                reward.source_record_key`,
    )
    .all(...nodeIds) as Array<{
    nodeId: string;
    key: string;
    label: string;
    quantity: number | null;
    trigger: "objective" | "junction-completion";
    objectiveKey: string | null;
    sortOrder: number;
    sourceName: string;
    citationUrl: string | null;
    entityKind: string | null;
    entitySlug: string | null;
    entityName: string | null;
    entityDescription: string | null;
  }>;
  for (const {
    nodeId,
    quantity,
    objectiveKey,
    citationUrl,
    entityKind,
    entitySlug,
    entityName,
    entityDescription,
    ...reward
  } of rows) {
    const rewards = result.get(nodeId) ?? [];
    rewards.push({
      ...reward,
      quantity: quantity ?? undefined,
      objectiveKey: objectiveKey ?? undefined,
      citationUrl: citationUrl ?? undefined,
      entity:
        entityKind && entitySlug && entityName
          ? {
              kind: entityKind,
              slug: entitySlug,
              name: entityName,
              description: entityDescription ?? undefined,
            }
          : undefined,
    });
    result.set(nodeId, rewards);
  }
  return result;
}

export function listSourceStatuses(sqlite: Database.Database): SourceStatus[] {
  return sqlite
    .prepare(
      `
    select source.id, source.name, source.homepage, source.license,
           run.version, run.retrieved_at as retrievedAt, run.content_hash as contentHash,
           run.observation_count as observationCount,
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
  `,
    )
    .all() as SourceStatus[];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

type NodeDetails = Pick<
  CatalogNode,
  | "planet"
  | "missionType"
  | "faction"
  | "minimumEnemyLevel"
  | "maximumEnemyLevel"
  | "masteryRequirement"
  | "railjackIntrinsicRequirement"
  | "warframeRankRequirement"
  | "activeAdversaryRequirement"
  | "detailEvidence"
>;
function loadNodeDetails(
  sqlite: Database.Database,
  entityIds: string[],
): Map<string, NodeDetails> {
  if (!entityIds.length) return new Map();
  const placeholders = entityIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `
    select detail.entity_id as entityId, detail.planet, detail.mission_type as missionType,
      detail.faction, detail.minimum_enemy_level as minimumEnemyLevel,
      detail.maximum_enemy_level as maximumEnemyLevel, detail.mastery_requirement as masteryRequirement,
      detail.railjack_intrinsic_requirement as railjackIntrinsicRequirement,
      detail.warframe_rank_requirement as warframeRankRequirement,
      detail.active_adversary_requirement as activeAdversaryRequirement,
      source.name as sourceName, run.version, detail.source_record_key as recordKey,
      detail.source_path as sourcePath, detail.citation_url as citationUrl
    from node_details detail
    join source_runs run on run.id = detail.source_run_id and run.status = 'active'
    join sources source on source.id = run.source_id
    where detail.entity_id in (${placeholders})
    order by source.priority desc, run.retrieved_at desc, source.id, detail.source_record_key, detail.id
  `,
    )
    .all(...entityIds) as Array<{
    entityId: string;
    planet: string;
    missionType: string | null;
    faction: string | null;
    minimumEnemyLevel: number | null;
    maximumEnemyLevel: number | null;
    masteryRequirement: number | null;
    railjackIntrinsicRequirement: number | null;
    warframeRankRequirement: number | null;
    activeAdversaryRequirement: AdversaryKind | null;
    sourceName: string;
    version: string;
    recordKey: string;
    sourcePath: string | null;
    citationUrl: string | null;
  }>;
  const result = new Map<string, NodeDetails>();
  for (const row of rows) {
    const current = result.get(row.entityId) ?? { detailEvidence: [] };
    current.planet ??= row.planet;
    current.missionType ??= row.missionType ?? undefined;
    current.faction ??= row.faction ?? undefined;
    current.minimumEnemyLevel ??= row.minimumEnemyLevel ?? undefined;
    current.maximumEnemyLevel ??= row.maximumEnemyLevel ?? undefined;
    current.masteryRequirement ??= row.masteryRequirement ?? undefined;
    current.railjackIntrinsicRequirement ??=
      row.railjackIntrinsicRequirement ?? undefined;
    current.warframeRankRequirement ??=
      row.warframeRankRequirement ?? undefined;
    current.activeAdversaryRequirement ??=
      row.activeAdversaryRequirement ?? undefined;
    current.detailEvidence.push({
      sourceName: row.sourceName,
      version: row.version,
      recordKey: row.recordKey,
      sourcePath: row.sourcePath ?? undefined,
      citationUrl: row.citationUrl ?? undefined,
    });
    result.set(row.entityId, current);
  }
  return result;
}

function loadNodeConnections(
  sqlite: Database.Database,
  entityIds: string[],
): Map<string, CatalogNode["connections"]> {
  if (!entityIds.length) return new Map();
  const placeholders = entityIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `
    select relation.from_entity_id as entityId, target.id as targetId, target.slug, target.name
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join entities target on target.id = relation.to_entity_id and target.kind = 'node' and target.retired = 0
    where relation.kind = 'connects-to' and relation.from_entity_id in (${placeholders})
    union
    select relation.to_entity_id, origin.id, origin.slug, origin.name
    from entity_relations relation
    join source_runs run on run.id = relation.source_run_id and run.status = 'active'
    join entities origin on origin.id = relation.from_entity_id and origin.kind = 'node' and origin.retired = 0
    where relation.kind = 'connects-to' and relation.to_entity_id in (${placeholders})
    order by name collate nocase
  `,
    )
    .all(...entityIds, ...entityIds) as Array<{
    entityId: string;
    targetId: string;
    slug: string;
    name: string;
  }>;
  const targetDetails = loadNodeDetails(sqlite, [
    ...new Set(rows.map(({ targetId }) => targetId)),
  ]);
  const result = new Map<string, CatalogNode["connections"]>();
  for (const row of rows) {
    result.set(row.entityId, [
      ...(result.get(row.entityId) ?? []),
      {
        slug: row.slug,
        name: row.name,
        planet: targetDetails.get(row.targetId)?.planet,
      },
    ]);
  }
  return result;
}
