CREATE TABLE `player_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mastery_rank` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
