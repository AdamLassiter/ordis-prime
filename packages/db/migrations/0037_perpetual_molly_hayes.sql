CREATE TABLE `player_node_progress` (
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `node_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `player_node_progress_completed` ON `player_node_progress` (`user_id`,`completed_at`);