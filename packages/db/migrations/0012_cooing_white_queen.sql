CREATE TABLE `player_discovery_progress` (
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `entity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `player_discovery_progress_state` ON `player_discovery_progress` (`user_id`,`state`);--> statement-breakpoint
DROP TABLE `player_node_progress`;