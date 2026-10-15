CREATE TABLE `entity_identity_override_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_source_id` text NOT NULL,
	`external_source_id` text NOT NULL,
	`namespace` text NOT NULL,
	`value` text NOT NULL,
	`entity_id` text NOT NULL,
	`conflict_id` text,
	`user_id` text,
	`actor_name` text DEFAULT 'Deleted account' NOT NULL,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`external_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conflict_id`) REFERENCES `ingestion_conflicts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `identity_override_events_owner_created` ON `entity_identity_override_events` (`owner_source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `entity_identity_overrides` (
	`owner_source_id` text NOT NULL,
	`external_source_id` text NOT NULL,
	`namespace` text NOT NULL,
	`value` text NOT NULL,
	`entity_id` text NOT NULL,
	`conflict_id` text NOT NULL,
	`user_id` text,
	`actor_name` text DEFAULT 'Deleted account' NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`external_source_id`, `namespace`, `value`),
	FOREIGN KEY (`owner_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`external_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conflict_id`) REFERENCES `ingestion_conflicts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `identity_overrides_owner_source` ON `entity_identity_overrides` (`owner_source_id`);--> statement-breakpoint
ALTER TABLE `ingestion_conflicts` ADD `external_ids_json` text DEFAULT '[]' NOT NULL;