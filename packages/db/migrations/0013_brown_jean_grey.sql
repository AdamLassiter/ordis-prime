ALTER TABLE `build_equipment` ADD `configuration` text;--> statement-breakpoint
ALTER TABLE `build_equipment` ADD `forma_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `build_equipment` ADD `capacity_upgrade` integer DEFAULT false NOT NULL;