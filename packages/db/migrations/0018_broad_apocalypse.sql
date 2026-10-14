CREATE TABLE `build_enhancements` (
	`id` text PRIMARY KEY NOT NULL,
	`build_id` text NOT NULL,
	`slot` text NOT NULL,
	`entity_id` text NOT NULL,
	`rank` integer,
	FOREIGN KEY (`build_id`) REFERENCES `player_builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_enhancement_slot` ON `build_enhancements` (`build_id`,`slot`);