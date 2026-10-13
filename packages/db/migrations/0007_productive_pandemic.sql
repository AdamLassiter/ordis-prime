CREATE TABLE `player_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'open' NOT NULL,
	`due_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `player_todos_user_status` ON `player_todos` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `player_todos_due` ON `player_todos` (`due_at`);