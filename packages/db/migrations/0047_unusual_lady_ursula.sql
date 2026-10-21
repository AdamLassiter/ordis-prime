CREATE TABLE `build_modular_parts` (
	`equipment_id` text NOT NULL,
	`role` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`equipment_id`, `role`),
	FOREIGN KEY (`equipment_id`) REFERENCES `build_equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
