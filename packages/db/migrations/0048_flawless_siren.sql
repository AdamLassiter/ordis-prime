CREATE TABLE `entity_attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_attribute_run_key` ON `entity_attributes` (`source_run_id`,`entity_id`,`key`);--> statement-breakpoint
CREATE INDEX `entity_attribute_entity` ON `entity_attributes` (`entity_id`);