CREATE TABLE `entity_aliases` (
	`entity_id` text NOT NULL,
	`normalized` text NOT NULL,
	`display` text NOT NULL,
	PRIMARY KEY(`entity_id`, `normalized`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alias_lookup` ON `entity_aliases` (`normalized`);--> statement-breakpoint
CREATE TABLE `catalog_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`promoted_at` integer,
	`active` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingestion_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_run_id` text NOT NULL,
	`record_key` text NOT NULL,
	`reason` text NOT NULL,
	`candidates_json` text NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `drops` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_id` text NOT NULL,
	`node_id` text,
	`location_label` text NOT NULL,
	`chance` real,
	`rotation` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`source_run_id` text NOT NULL,
	FOREIGN KEY (`reward_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `drop_reward` ON `drops` (`reward_id`);--> statement-breakpoint
CREATE INDEX `drop_node` ON `drops` (`node_id`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`retired` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_kind_slug` ON `entities` (`kind`,`slug`);--> statement-breakpoint
CREATE INDEX `entity_name` ON `entities` (`name`);--> statement-breakpoint
CREATE TABLE `external_ids` (
	`entity_id` text NOT NULL,
	`source_id` text NOT NULL,
	`namespace` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`source_id`, `namespace`, `value`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `external_entity` ON `external_ids` (`entity_id`);--> statement-breakpoint
CREATE TABLE `player_inventory` (
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`owned_count` integer DEFAULT 0 NOT NULL,
	`built_count` integer DEFAULT 0 NOT NULL,
	`wanted_count` integer DEFAULT 0 NOT NULL,
	`mastered` integer,
	`subsumed` integer,
	`note` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `entity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`run_after` integer NOT NULL,
	`lease_owner` text,
	`lease_until` integer,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `player_node_progress` (
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `node_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fact_provenance` (
	`entity_id` text NOT NULL,
	`field` text NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	PRIMARY KEY(`entity_id`, `field`, `source_run_id`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`recipe_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`quantity` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `entity_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`output_id` text NOT NULL,
	`output_quantity` integer DEFAULT 1 NOT NULL,
	`source_run_id` text NOT NULL,
	FOREIGN KEY (`output_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`version` text NOT NULL,
	`content_hash` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_run_version` ON `source_runs` (`source_id`,`version`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`homepage` text NOT NULL,
	`license` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);