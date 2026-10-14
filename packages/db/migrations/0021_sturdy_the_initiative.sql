PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ingestion_conflict_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`conflict_id` text NOT NULL,
	`user_id` text,
	`actor_name` text DEFAULT 'Deleted account' NOT NULL,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conflict_id`) REFERENCES `ingestion_conflicts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_ingestion_conflict_review_events`("id", "conflict_id", "user_id", "actor_name", "action", "note", "created_at") SELECT event."id", event."conflict_id", event."user_id", coalesce(user."username", 'Deleted account'), event."action", event."note", event."created_at" FROM `ingestion_conflict_review_events` event LEFT JOIN `users` user ON user."id" = event."user_id";--> statement-breakpoint
DROP TABLE `ingestion_conflict_review_events`;--> statement-breakpoint
ALTER TABLE `__new_ingestion_conflict_review_events` RENAME TO `ingestion_conflict_review_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `conflict_review_events_conflict_created` ON `ingestion_conflict_review_events` (`conflict_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_player_inventory` (
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`owned_count` integer DEFAULT 0 NOT NULL,
	`built_count` integer DEFAULT 0 NOT NULL,
	`wanted_count` integer DEFAULT 0 NOT NULL,
	`mastered` integer,
	`subsumed` integer,
	`note` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `entity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_player_inventory`("user_id", "entity_id", "owned_count", "built_count", "wanted_count", "mastered", "subsumed", "note", "updated_at") SELECT "user_id", "entity_id", "owned_count", "built_count", "wanted_count", "mastered", "subsumed", "note", "updated_at" FROM `player_inventory`;--> statement-breakpoint
DROP TABLE `player_inventory`;--> statement-breakpoint
ALTER TABLE `__new_player_inventory` RENAME TO `player_inventory`;
