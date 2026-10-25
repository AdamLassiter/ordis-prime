CREATE TABLE `player_import_device_events` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`request_id` text,
	`error` text,
	FOREIGN KEY (`device_id`) REFERENCES `player_import_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `player_import_device_events_device_occurred` ON `player_import_device_events` (`device_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `player_import_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`previous_token_hash` text,
	`previous_valid_until` integer,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`revoked_at` integer,
	`rate_window_started_at` integer NOT NULL,
	`rate_window_request_count` integer DEFAULT 0 NOT NULL,
	`last_request_id` text,
	`last_request_next_token_hash` text,
	`last_response_json` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_import_devices_token_hash_unique` ON `player_import_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `player_import_devices_user_created` ON `player_import_devices` (`user_id`,`created_at`);