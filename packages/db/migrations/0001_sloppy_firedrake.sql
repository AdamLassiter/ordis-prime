CREATE TABLE `editorial_rankings` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`tier` text NOT NULL,
	`position` integer,
	`timestamp_seconds` integer,
	`notes` text,
	FOREIGN KEY (`set_id`) REFERENCES `ranking_sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_set_entity` ON `editorial_rankings` (`set_id`,`entity_id`);--> statement-breakpoint
CREATE INDEX `ranking_entity` ON `editorial_rankings` (`entity_id`);--> statement-breakpoint
CREATE TABLE `ranking_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`source_run_id` text NOT NULL,
	`set_key` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`published_at` integer NOT NULL,
	`game_version` text,
	`scope` text NOT NULL,
	`scale_json` text NOT NULL,
	`license_note` text NOT NULL,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ranking_set_run_key` ON `ranking_sets` (`source_run_id`,`set_key`);