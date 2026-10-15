CREATE TABLE `entity_enhancement_options` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enhancement_option_run_key` ON `entity_enhancement_options` (`source_run_id`,`entity_id`,`key`);--> statement-breakpoint
CREATE INDEX `enhancement_option_entity` ON `entity_enhancement_options` (`entity_id`);--> statement-breakpoint
ALTER TABLE `build_enhancements` ADD `option_key` text;--> statement-breakpoint
ALTER TABLE `build_enhancements` ADD `option_label` text;