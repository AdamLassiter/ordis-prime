CREATE TABLE `build_ability_replacements` (
	`build_id` text PRIMARY KEY NOT NULL,
	`original_ability_id` text NOT NULL,
	`replacement_ability_id` text NOT NULL,
	FOREIGN KEY (`build_id`) REFERENCES `player_builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`original_ability_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replacement_ability_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP INDEX `build_mod_slot_special_role`;--> statement-breakpoint
ALTER TABLE `player_builds` ADD `focus_school_entity_id` text REFERENCES entities(id);