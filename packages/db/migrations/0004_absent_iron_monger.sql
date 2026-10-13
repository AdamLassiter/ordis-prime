CREATE TABLE `source_refreshes` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_run_id` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`snapshot_path` text,
	`error` text,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `source_refreshes_source_started` ON `source_refreshes` (`source_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `source_runs` ADD `snapshot_path` text;