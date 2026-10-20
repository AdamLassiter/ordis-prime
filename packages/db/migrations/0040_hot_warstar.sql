CREATE TABLE `node_item_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`node_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_item_requirement_run_record` ON `node_item_requirements` (`source_run_id`,`source_record_key`);--> statement-breakpoint
CREATE INDEX `node_item_requirement_node` ON `node_item_requirements` (`node_id`);--> statement-breakpoint
CREATE INDEX `node_item_requirement_item` ON `node_item_requirements` (`item_id`);