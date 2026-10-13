CREATE TABLE `world_state_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`version` text NOT NULL,
	`content_hash` text NOT NULL,
	`observed_at` integer NOT NULL,
	`snapshot_path` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_state_source_version` ON `world_state_snapshots` (`source_id`,`version`);--> statement-breakpoint
CREATE INDEX `world_state_active` ON `world_state_snapshots` (`active`);--> statement-breakpoint
CREATE TABLE `world_state_windows` (
	`snapshot_id` text NOT NULL,
	`external_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`activation` integer,
	`expiry` integer,
	`state` text,
	`node_label` text,
	`metadata_json` text NOT NULL,
	`source_record_key` text NOT NULL,
	`source_path` text,
	PRIMARY KEY(`snapshot_id`, `external_id`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `world_state_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `world_state_window_expiry` ON `world_state_windows` (`expiry`);--> statement-breakpoint
ALTER TABLE `source_refreshes` ADD `world_state_snapshot_id` text REFERENCES world_state_snapshots(id);