CREATE TABLE `node_details` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`planet` text NOT NULL,
	`mission_type` text,
	`faction` text,
	`minimum_enemy_level` integer,
	`maximum_enemy_level` integer,
	`mastery_requirement` integer,
	`node_type` integer,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `node_details_entity` ON `node_details` (`entity_id`);--> statement-breakpoint
CREATE INDEX `node_details_planet` ON `node_details` (`planet`);