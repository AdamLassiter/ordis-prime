CREATE TABLE IF NOT EXISTS `equipment_polarity_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`configuration` text,
	`polarities_json` text NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `equipment_polarity_set_run_record` ON `equipment_polarity_sets` (`source_run_id`,`source_record_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `equipment_polarity_set_entity` ON `equipment_polarity_sets` (`entity_id`);
