import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text().primaryKey(), name: text().notNull(), homepage: text().notNull(), license: text(), priority: integer().notNull().default(0), enabled: integer({ mode: "boolean" }).notNull().default(true),
});
export const sourceRuns = sqliteTable("source_runs", {
  id: text().primaryKey(), sourceId: text("source_id").notNull().references(() => sources.id), version: text().notNull(), contentHash: text("content_hash").notNull(), retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(), snapshotPath: text("snapshot_path"), status: text({ enum: ["running", "failed", "staged", "active"] }).notNull(), error: text(),
}, (table) => [uniqueIndex("source_run_version").on(table.sourceId, table.version)]);
export const worldStateSnapshots = sqliteTable("world_state_snapshots", {
  id: text().primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  version: text().notNull(),
  contentHash: text("content_hash").notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
  snapshotPath: text("snapshot_path").notNull(),
  active: integer({ mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("world_state_source_version").on(table.sourceId, table.version), index("world_state_active").on(table.active)]);
export const worldStateWindows = sqliteTable("world_state_windows", {
  snapshotId: text("snapshot_id").notNull().references(() => worldStateSnapshots.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  kind: text({ enum: ["cycle", "alert", "fissure", "event", "trader"] }).notNull(),
  label: text().notNull(),
  activation: integer({ mode: "timestamp_ms" }),
  expiry: integer({ mode: "timestamp_ms" }),
  state: text(),
  nodeLabel: text("node_label"),
  nodeEntityId: text("node_entity_id").references(() => entities.id),
  metadataJson: text("metadata_json").notNull(),
  sourceRecordKey: text("source_record_key").notNull(),
  sourcePath: text("source_path"),
}, (table) => [primaryKey({ columns: [table.snapshotId, table.externalId] }), index("world_state_window_expiry").on(table.expiry)]);
export const sourceRefreshes = sqliteTable("source_refreshes", {
  id: text().primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceRunId: text("source_run_id").references(() => sourceRuns.id),
  worldStateSnapshotId: text("world_state_snapshot_id").references(() => worldStateSnapshots.id),
  status: text({ enum: ["running", "succeeded", "failed"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  snapshotPath: text("snapshot_path"),
  error: text(),
}, (table) => [index("source_refreshes_source_started").on(table.sourceId, table.startedAt)]);
export const catalogReleases = sqliteTable("catalog_releases", {
  id: text().primaryKey(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), promotedAt: integer("promoted_at", { mode: "timestamp_ms" }), active: integer({ mode: "boolean" }).notNull().default(false),
});
export const catalogReleaseSources = sqliteTable("catalog_release_sources", {
  releaseId: text("release_id").notNull().references(() => catalogReleases.id, { onDelete: "cascade" }),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id),
}, (table) => [primaryKey({ columns: [table.releaseId, table.sourceId] }), uniqueIndex("catalog_release_source_run").on(table.releaseId, table.sourceRunId)]);
export const entities = sqliteTable("entities", {
  id: text().primaryKey(), kind: text().notNull(), name: text().notNull(), slug: text().notNull(), description: text(), retired: integer({ mode: "boolean" }).notNull().default(false), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("entity_kind_slug").on(table.kind, table.slug), index("entity_name").on(table.name)]);
export const externalIds = sqliteTable("external_ids", {
  entityId: text("entity_id").notNull().references(() => entities.id), sourceId: text("source_id").notNull().references(() => sources.id), namespace: text().notNull(), value: text().notNull(),
}, (table) => [primaryKey({ columns: [table.sourceId, table.namespace, table.value] }), index("external_entity").on(table.entityId)]);
export const aliases = sqliteTable("entity_aliases", {
  entityId: text("entity_id").notNull().references(() => entities.id), normalized: text().notNull(), display: text().notNull(),
}, (table) => [primaryKey({ columns: [table.entityId, table.normalized] }), index("alias_lookup").on(table.normalized)]);
export const provenance = sqliteTable("fact_provenance", {
  entityId: text("entity_id").notNull().references(() => entities.id), field: text().notNull(), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id), sourceRecordKey: text("source_record_key").notNull(), citationUrl: text("citation_url"), sourcePath: text("source_path"),
}, (table) => [primaryKey({ columns: [table.entityId, table.field, table.sourceRunId] })]);
export const recipes = sqliteTable("recipes", { id: text().primaryKey(), outputId: text("output_id").notNull().references(() => entities.id), outputQuantity: integer("output_quantity").notNull().default(1), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id), sourceRecordKey: text("source_record_key"), citationUrl: text("citation_url"), sourcePath: text("source_path") });
export const recipeIngredients = sqliteTable("recipe_ingredients", { recipeId: text("recipe_id").notNull().references(() => recipes.id), entityId: text("entity_id").notNull().references(() => entities.id), quantity: integer().notNull() }, (table) => [primaryKey({ columns: [table.recipeId, table.entityId] })]);
export const drops = sqliteTable("drops", { id: text().primaryKey(), rewardId: text("reward_id").notNull().references(() => entities.id), nodeId: text("node_id").references(() => entities.id), locationLabel: text("location_label").notNull(), chance: real(), rotation: text(), quantity: integer().notNull().default(1), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id), sourceRecordKey: text("source_record_key"), citationUrl: text("citation_url"), sourcePath: text("source_path") }, (table) => [index("drop_reward").on(table.rewardId), index("drop_node").on(table.nodeId)]);
export const nodeDetails = sqliteTable("node_details", {
  id: text().primaryKey(), entityId: text("entity_id").notNull().references(() => entities.id),
  planet: text().notNull(), missionType: text("mission_type"), faction: text(),
  minimumEnemyLevel: integer("minimum_enemy_level"), maximumEnemyLevel: integer("maximum_enemy_level"),
  masteryRequirement: integer("mastery_requirement"), nodeType: integer("node_type"),
  sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id),
  sourceRecordKey: text("source_record_key").notNull(), citationUrl: text("citation_url"), sourcePath: text("source_path"),
}, (table) => [index("node_details_entity").on(table.entityId), index("node_details_planet").on(table.planet)]);
export const entityRelations = sqliteTable("entity_relations", {
  id: text().primaryKey(),
  fromEntityId: text("from_entity_id").notNull().references(() => entities.id),
  toEntityId: text("to_entity_id").notNull().references(() => entities.id),
  kind: text({ enum: ["requires", "unlocks", "occurs-at", "involves", "rewards", "connects-to"] }).notNull(),
  notes: text(),
  sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id),
  sourceRecordKey: text("source_record_key").notNull(),
  citationUrl: text("citation_url"),
  sourcePath: text("source_path"),
}, (table) => [index("entity_relations_from").on(table.fromEntityId), index("entity_relations_to").on(table.toEntityId)]);
export const conflicts = sqliteTable("ingestion_conflicts", { id: text().primaryKey(), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id), recordKey: text("record_key").notNull(), reason: text().notNull(), candidatesJson: text("candidates_json").notNull(), resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }) });
export const rankingSets = sqliteTable("ranking_sets", { id: text().primaryKey(), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id), setKey: text("set_key").notNull(), title: text().notNull(), author: text().notNull(), publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(), gameVersion: text("game_version"), scope: text().notNull(), scaleJson: text("scale_json").notNull(), licenseNote: text("license_note").notNull(), sourceRecordKey: text("source_record_key"), citationUrl: text("citation_url"), sourcePath: text("source_path") }, (table) => [uniqueIndex("ranking_set_run_key").on(table.sourceRunId, table.setKey)]);
export const editorialRankings = sqliteTable("editorial_rankings", { id: text().primaryKey(), setId: text("set_id").notNull().references(() => rankingSets.id), entityId: text("entity_id").notNull().references(() => entities.id), tier: text().notNull(), position: integer(), timestampSeconds: integer("timestamp_seconds"), notes: text(), sourceRecordKey: text("source_record_key"), citationUrl: text("citation_url"), sourcePath: text("source_path") }, (table) => [uniqueIndex("ranking_set_entity").on(table.setId, table.entityId), index("ranking_entity").on(table.entityId)]);
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  username: text().notNull(),
  email: text().notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text(),
  role: text({ enum: ["admin", "player"] }).notNull().default("player"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);
export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text().notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("sessions_token_unique").on(table.token), index("sessions_user_id").on(table.userId)]);
export const accounts = sqliteTable("accounts", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text(),
  password: text(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("accounts_user_id").on(table.userId), uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId)]);
export const verifications = sqliteTable("verifications", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("verifications_identifier").on(table.identifier)]);
export const conflictReviewEvents = sqliteTable("ingestion_conflict_review_events", {
  id: text().primaryKey(),
  conflictId: text("conflict_id").notNull().references(() => conflicts.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull().default("Deleted account"),
  action: text({ enum: ["reviewed", "reopened"] }).notNull(),
  note: text().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("conflict_review_events_conflict_created").on(table.conflictId, table.createdAt)]);
export const inventory = sqliteTable("player_inventory", { userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), entityId: text("entity_id").notNull().references(() => entities.id), ownedCount: integer("owned_count").notNull().default(0), builtCount: integer("built_count").notNull().default(0), wantedCount: integer("wanted_count").notNull().default(0), mastered: integer({ mode: "boolean" }), subsumed: integer({ mode: "boolean" }), note: text(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() }, (table) => [primaryKey({ columns: [table.userId, table.entityId] })]);
export const goals = sqliteTable("player_goals", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull().references(() => entities.id),
  targetQuantity: integer("target_quantity").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.entityId] }), index("player_goals_entity").on(table.entityId)]);
export const recipePreferences = sqliteTable("player_recipe_preferences", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  outputEntityId: text("output_entity_id").notNull().references(() => entities.id),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceRecordKey: text("source_record_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.outputEntityId] })]);
export const playerTodos = sqliteTable("player_todos", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityId: text("entity_id").references(() => entities.id),
  title: text().notNull(),
  notes: text(),
  status: text({ enum: ["open", "completed"] }).notNull().default("open"),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
  recurrenceDays: integer("recurrence_days"),
  recurrenceSourceId: text("recurrence_source_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("player_todos_user_status").on(table.userId, table.status), index("player_todos_due").on(table.dueAt), uniqueIndex("player_todos_recurrence_source").on(table.recurrenceSourceId)]);
export const worldStateWatches = sqliteTable("world_state_watches", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityId: text("entity_id").references(() => entities.id),
  kind: text({ enum: ["cycle", "alert", "fissure", "event", "trader"] }).notNull(),
  labelContains: text("label_contains"),
  stateEquals: text("state_equals"),
  nodeContains: text("node_contains"),
  trigger: text({ enum: ["active", "starting", "ending"] }).notNull(),
  leadMinutes: integer("lead_minutes").notNull().default(0),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("world_state_watches_user").on(table.userId, table.enabled)]);
export const playerNotifications = sqliteTable("player_notifications", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  watchId: text("watch_id").notNull().references(() => worldStateWatches.id, { onDelete: "cascade" }),
  occurrenceKey: text("occurrence_key").notNull(),
  title: text().notNull(),
  body: text().notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("player_notification_occurrence").on(table.watchId, table.occurrenceKey), index("player_notifications_user_read").on(table.userId, table.readAt)]);
export const playerBuilds = sqliteTable("player_builds", {
  id: text().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text().notNull(),
  category: text(),
  notes: text(),
  revision: integer().notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("player_builds_user_updated").on(table.userId, table.updatedAt)]);
export const buildEquipment = sqliteTable("build_equipment", {
  id: text().primaryKey(),
  buildId: text("build_id").notNull().references(() => playerBuilds.id, { onDelete: "cascade" }),
  slot: text().notNull(),
  entityId: text("entity_id").notNull().references(() => entities.id),
  notes: text(),
  configuration: text(),
  formaCount: integer("forma_count").notNull().default(0),
  capacityUpgrade: integer("capacity_upgrade", { mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("build_equipment_slot").on(table.buildId, table.slot)]);
export const buildMods = sqliteTable("build_mods", {
  id: text().primaryKey(),
  equipmentId: text("equipment_id").notNull().references(() => buildEquipment.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  entityId: text("entity_id").notNull().references(() => entities.id),
  rank: integer(),
}, (table) => [uniqueIndex("build_mod_position").on(table.equipmentId, table.position)]);
export const buildEnhancements = sqliteTable("build_enhancements", {
  id: text().primaryKey(),
  buildId: text("build_id").notNull().references(() => playerBuilds.id, { onDelete: "cascade" }),
  slot: text().notNull(),
  entityId: text("entity_id").notNull().references(() => entities.id),
  rank: integer(),
}, (table) => [uniqueIndex("build_enhancement_slot").on(table.buildId, table.slot)]);
export const buildShareSnapshots = sqliteTable("build_share_snapshots", {
  id: text().primaryKey(),
  shareKey: text("share_key").notNull(),
  sourceBuildId: text("source_build_id").references(() => playerBuilds.id, { onDelete: "set null" }),
  revision: integer().notNull(),
  title: text().notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("build_share_key").on(table.shareKey), index("build_share_source").on(table.sourceBuildId)]);
export const discoveryProgress = sqliteTable("player_discovery_progress", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull().references(() => entities.id),
  state: text({ enum: ["discovered", "completed"] }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.entityId] }), index("player_discovery_progress_state").on(table.userId, table.state)]);
export const jobs = sqliteTable("jobs", { id: text().primaryKey(), kind: text().notNull(), status: text({ enum: ["queued", "running", "succeeded", "failed"] }).notNull(), payloadJson: text("payload_json").notNull(), runAfter: integer("run_after", { mode: "timestamp_ms" }).notNull(), leaseOwner: text("lease_owner"), leaseUntil: integer("lease_until", { mode: "timestamp_ms" }), error: text() });
