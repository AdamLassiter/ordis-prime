import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text().primaryKey(), name: text().notNull(), homepage: text().notNull(), license: text(), priority: integer().notNull().default(0), enabled: integer({ mode: "boolean" }).notNull().default(true),
});
export const sourceRuns = sqliteTable("source_runs", {
  id: text().primaryKey(), sourceId: text("source_id").notNull().references(() => sources.id), version: text().notNull(), contentHash: text("content_hash").notNull(), retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(), status: text({ enum: ["running", "failed", "staged", "active"] }).notNull(), error: text(),
}, (table) => [uniqueIndex("source_run_version").on(table.sourceId, table.version)]);
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
export const users = sqliteTable("users", { id: text().primaryKey(), username: text().notNull().unique(), role: text({ enum: ["admin", "player"] }).notNull().default("player"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() });
export const inventory = sqliteTable("player_inventory", { userId: text("user_id").notNull().references(() => users.id), entityId: text("entity_id").notNull().references(() => entities.id), ownedCount: integer("owned_count").notNull().default(0), builtCount: integer("built_count").notNull().default(0), wantedCount: integer("wanted_count").notNull().default(0), mastered: integer({ mode: "boolean" }), subsumed: integer({ mode: "boolean" }), note: text(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() }, (table) => [primaryKey({ columns: [table.userId, table.entityId] })]);
export const nodeProgress = sqliteTable("player_node_progress", { userId: text("user_id").notNull().references(() => users.id), nodeId: text("node_id").notNull().references(() => entities.id), state: text({ enum: ["unknown", "locked", "available", "completed"] }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() }, (table) => [primaryKey({ columns: [table.userId, table.nodeId] })]);
export const jobs = sqliteTable("jobs", { id: text().primaryKey(), kind: text().notNull(), status: text({ enum: ["queued", "running", "succeeded", "failed"] }).notNull(), payloadJson: text("payload_json").notNull(), runAfter: integer("run_after", { mode: "timestamp_ms" }).notNull(), leaseOwner: text("lease_owner"), leaseUntil: integer("lease_until", { mode: "timestamp_ms" }), error: text() });
