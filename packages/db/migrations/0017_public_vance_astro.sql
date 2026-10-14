ALTER TABLE `player_todos` ADD `recurrence_days` integer;--> statement-breakpoint
ALTER TABLE `player_todos` ADD `recurrence_source_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `player_todos_recurrence_source` ON `player_todos` (`recurrence_source_id`);