CREATE TABLE `cyclic_reward_choices` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`phase_index` integer NOT NULL,
	`phase_label` text NOT NULL,
	`position` integer NOT NULL,
	`primary_entity_id` text,
	`primary_label` text NOT NULL,
	`acquisition_mode` text NOT NULL,
	`included_rewards_json` text DEFAULT '[]' NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`schedule_id`) REFERENCES `cyclic_reward_schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`primary_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cyclic_reward_choice_phase_position` ON `cyclic_reward_choices` (`schedule_id`,`phase_index`,`position`);--> statement-breakpoint
CREATE INDEX `cyclic_reward_choice_entity` ON `cyclic_reward_choices` (`primary_entity_id`);--> statement-breakpoint
CREATE TABLE `cyclic_reward_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`epoch` integer NOT NULL,
	`interval_seconds` integer NOT NULL,
	`phase_count` integer NOT NULL,
	`choices_per_phase` integer NOT NULL,
	`selections_allowed` integer NOT NULL,
	`instructions` text NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cyclic_reward_schedule_run_key` ON `cyclic_reward_schedules` (`source_run_id`,`key`);