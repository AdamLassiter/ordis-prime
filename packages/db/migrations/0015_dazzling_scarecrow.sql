CREATE TABLE `ingestion_conflict_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`conflict_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conflict_id`) REFERENCES `ingestion_conflicts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conflict_review_events_conflict_created` ON `ingestion_conflict_review_events` (`conflict_id`,`created_at`);