PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_player_node_progress` (
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`mode` text NOT NULL,
	`completed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `node_id`, `mode`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_player_node_progress`("user_id", "node_id", "mode", "completed_at", "updated_at") SELECT "user_id", "node_id", 'normal', "completed_at", "updated_at" FROM `player_node_progress`;--> statement-breakpoint
DROP TABLE `player_node_progress`;--> statement-breakpoint
ALTER TABLE `__new_player_node_progress` RENAME TO `player_node_progress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `player_node_progress_completed` ON `player_node_progress` (`user_id`,`mode`,`completed_at`);
