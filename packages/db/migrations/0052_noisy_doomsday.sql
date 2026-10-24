CREATE TABLE `player_import_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`token_hash` text,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`result_json` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_import_pairings_token_hash_unique` ON `player_import_pairings` (`token_hash`);--> statement-breakpoint
CREATE INDEX `player_import_pairings_user_created` ON `player_import_pairings` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `player_import_pairings_expiry` ON `player_import_pairings` (`expires_at`);