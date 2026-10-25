ALTER TABLE `player_profiles` ADD `collection_layout` text DEFAULT 'cards' NOT NULL;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `display_density` text DEFAULT 'comfortable' NOT NULL;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `collection_highlighting` text DEFAULT 'badges' NOT NULL;