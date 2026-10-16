CREATE TABLE `build_mod_slots` (
	`equipment_id` text NOT NULL,
	`position` integer NOT NULL,
	`role` text NOT NULL,
	`polarity` text,
	PRIMARY KEY(`equipment_id`, `position`),
	FOREIGN KEY (`equipment_id`) REFERENCES `build_equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_mod_slot_special_role` ON `build_mod_slots` (`equipment_id`,`role`) WHERE "build_mod_slots"."role" <> 'normal';