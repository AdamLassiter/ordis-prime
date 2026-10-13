CREATE TABLE `player_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`watch_id` text NOT NULL,
	`occurrence_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watch_id`) REFERENCES `world_state_watches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_notification_occurrence` ON `player_notifications` (`watch_id`,`occurrence_key`);--> statement-breakpoint
CREATE INDEX `player_notifications_user_read` ON `player_notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `world_state_watches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`label_contains` text,
	`state_equals` text,
	`node_contains` text,
	`trigger` text NOT NULL,
	`lead_minutes` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `world_state_watches_user` ON `world_state_watches` (`user_id`,`enabled`);