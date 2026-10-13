CREATE TABLE `build_equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`build_id` text NOT NULL,
	`slot` text NOT NULL,
	`entity_id` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`build_id`) REFERENCES `player_builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_equipment_slot` ON `build_equipment` (`build_id`,`slot`);--> statement-breakpoint
CREATE TABLE `build_mods` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`position` integer NOT NULL,
	`entity_id` text NOT NULL,
	`rank` integer,
	FOREIGN KEY (`equipment_id`) REFERENCES `build_equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_mod_position` ON `build_mods` (`equipment_id`,`position`);--> statement-breakpoint
CREATE TABLE `build_share_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`share_key` text NOT NULL,
	`source_build_id` text,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_build_id`) REFERENCES `player_builds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_share_key` ON `build_share_snapshots` (`share_key`);--> statement-breakpoint
CREATE INDEX `build_share_source` ON `build_share_snapshots` (`source_build_id`);--> statement-breakpoint
CREATE TABLE `player_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`notes` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `player_builds_user_updated` ON `player_builds` (`user_id`,`updated_at`);