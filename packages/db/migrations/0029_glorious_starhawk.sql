CREATE TABLE `world_state_window_subjects` (
	`snapshot_id` text NOT NULL,
	`window_external_id` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`snapshot_id`, `window_external_id`, `entity_id`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `world_state_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `world_state_subject_entity` ON `world_state_window_subjects` (`entity_id`);--> statement-breakpoint
ALTER TABLE `world_state_windows` ADD `subject_labels_json` text DEFAULT '[]' NOT NULL;