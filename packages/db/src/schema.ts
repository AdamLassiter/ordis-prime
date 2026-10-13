import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text().primaryKey(), name: text().notNull(), homepage: text().notNull(), license: text(), priority: integer().notNull().default(0), enabled: integer({ mode: "boolean" }).notNull().default(true),
});
export const sourceRuns = sqliteTable("source_runs", {
  id: text().primaryKey(), sourceId: text("source_id").notNull().references(() => sources.id), version: text().notNull(), contentHash: text("content_hash").notNull(), retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(), snapshotPath: text("snapshot_path"), status: text({ enum: ["running", "failed", "staged", "active"] }).notNull(), error: text(),
}, (table) => [uniqueIndex("source_run_version").on(table.sourceId, table.version)]);
export const sourceRefreshes = sqliteTable("source_refreshes", {
  id: text().primaryKey(),
  sourceId: text("source_id").notNull().references(() => sources.id),
  sourceRunId: text("source_run_id").references(() => sourceRuns.id),
  status: text({ enum: ["running", "succeeded", "failed"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  snapshotPath: text("snapshot_path"),
  error: text(),
}, (table) => [index("source_refreshes_source_started").on(table.sourceId, table.startedAt)]);
export const catalogReleases = sqliteTable("catalog_releases", {
  id: text().primaryKey(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), promotedAt: integer("promoted_at", { mode: "timestamp_ms" }), active: integer({ mode: "boolean" }).notNull().default(false),
});
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
export const recipes = sqliteTable("recipes", { id: text().primaryKey(), outputId: text("output_id").notNull().references(() => entities.id), outputQuantity: integer("output_quantity").notNull().default(1), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id) });
export const recipeIngredients = sqliteTable("recipe_ingredients", { recipeId: text("recipe_id").notNull().references(() => recipes.id), entityId: text("entity_id").notNull().references(() => entities.id), quantity: integer().notNull() }, (table) => [primaryKey({ columns: [table.recipeId, table.entityId] })]);
export const drops = sqliteTable("drops", { id: text().primaryKey(), rewardId: text("reward_id").notNull().references(() => entities.id), nodeId: text("node_id").references(() => entities.id), locationLabel: text("location_label").notNull(), chance: real(), rotation: text(), quantity: integer().notNull().default(1), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id) }, (table) => [index("drop_reward").on(table.rewardId), index("drop_node").on(table.nodeId)]);
export const conflicts = sqliteTable("ingestion_conflicts", { id: text().primaryKey(), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id), recordKey: text("record_key").notNull(), reason: text().notNull(), candidatesJson: text("candidates_json").notNull(), resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }) });
export const rankingSets = sqliteTable("ranking_sets", { id: text().primaryKey(), sourceRunId: text("source_run_id").notNull().references(() => sourceRuns.id), setKey: text("set_key").notNull(), title: text().notNull(), author: text().notNull(), publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(), gameVersion: text("game_version"), scope: text().notNull(), scaleJson: text("scale_json").notNull(), licenseNote: text("license_note").notNull() }, (table) => [uniqueIndex("ranking_set_run_key").on(table.sourceRunId, table.setKey)]);
export const editorialRankings = sqliteTable("editorial_rankings", { id: text().primaryKey(), setId: text("set_id").notNull().references(() => rankingSets.id), entityId: text("entity_id").notNull().references(() => entities.id), tier: text().notNull(), position: integer(), timestampSeconds: integer("timestamp_seconds"), notes: text() }, (table) => [uniqueIndex("ranking_set_entity").on(table.setId, table.entityId), index("ranking_entity").on(table.entityId)]);
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
export const inventory = sqliteTable("player_inventory", { userId: text("user_id").notNull().references(() => users.id), entityId: text("entity_id").notNull().references(() => entities.id), ownedCount: integer("owned_count").notNull().default(0), builtCount: integer("built_count").notNull().default(0), wantedCount: integer("wanted_count").notNull().default(0), mastered: integer({ mode: "boolean" }), subsumed: integer({ mode: "boolean" }), note: text(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() }, (table) => [primaryKey({ columns: [table.userId, table.entityId] })]);
export const goals = sqliteTable("player_goals", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull().references(() => entities.id),
  targetQuantity: integer("target_quantity").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.entityId] }), index("player_goals_entity").on(table.entityId)]);
export const nodeProgress = sqliteTable("player_node_progress", { userId: text("user_id").notNull().references(() => users.id), nodeId: text("node_id").notNull().references(() => entities.id), state: text({ enum: ["unknown", "locked", "available", "completed"] }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() }, (table) => [primaryKey({ columns: [table.userId, table.nodeId] })]);
export const jobs = sqliteTable("jobs", { id: text().primaryKey(), kind: text().notNull(), status: text({ enum: ["queued", "running", "succeeded", "failed"] }).notNull(), payloadJson: text("payload_json").notNull(), runAfter: integer("run_after", { mode: "timestamp_ms" }).notNull(), leaseOwner: text("lease_owner"), leaseUntil: integer("lease_until", { mode: "timestamp_ms" }), error: text() });
