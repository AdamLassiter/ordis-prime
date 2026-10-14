CREATE TABLE `catalog_release_sources` (
	`release_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_run_id` text NOT NULL,
	PRIMARY KEY(`release_id`, `source_id`),
	FOREIGN KEY (`release_id`) REFERENCES `catalog_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_release_source_run` ON `catalog_release_sources` (`release_id`,`source_run_id`);