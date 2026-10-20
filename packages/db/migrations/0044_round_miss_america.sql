CREATE TABLE `player_node_objective_progress` (
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`source_id` text NOT NULL,
	`objective_key` text NOT NULL,
	`objective_label` text NOT NULL,
	`completed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `node_id`, `source_id`, `objective_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `player_node_objective_progress_completed` ON `player_node_objective_progress` (`user_id`,`completed_at`);