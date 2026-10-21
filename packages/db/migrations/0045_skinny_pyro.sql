CREATE TABLE `node_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`reward_entity_id` text,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`quantity` integer,
	`trigger` text NOT NULL,
	`objective_key` text,
	`sort_order` integer NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`node_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reward_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_reward_run_record` ON `node_rewards` (`source_run_id`,`source_record_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `node_reward_run_node_key` ON `node_rewards` (`source_run_id`,`node_id`,`key`);--> statement-breakpoint
CREATE INDEX `node_reward_node` ON `node_rewards` (`node_id`);--> statement-breakpoint
CREATE INDEX `node_reward_entity` ON `node_rewards` (`reward_entity_id`);