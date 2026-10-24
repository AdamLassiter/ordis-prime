CREATE TABLE `market_price_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`target_count` integer NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `market_price_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`item_id` text NOT NULL,
	`slug` text NOT NULL,
	`subtype` text,
	`rank` integer,
	`observed_at` integer NOT NULL,
	`listing_price` real,
	`quick_sale_price` real,
	`sell_order_count` integer NOT NULL,
	`buy_order_count` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `market_price_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_price_snapshot_variant` ON `market_price_snapshots` (`run_id`,`entity_id`,`subtype`,`rank`);--> statement-breakpoint
CREATE INDEX `market_price_snapshot_latest` ON `market_price_snapshots` (`entity_id`,`subtype`,`rank`,`observed_at`);--> statement-breakpoint
CREATE TABLE `market_price_targets` (
	`run_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`item_id` text NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	PRIMARY KEY(`run_id`, `entity_id`),
	FOREIGN KEY (`run_id`) REFERENCES `market_price_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `relic_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`relic_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`refinement` text NOT NULL,
	`rarity` text NOT NULL,
	`chance` real NOT NULL,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`relic_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reward_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relic_reward_run_record` ON `relic_rewards` (`source_run_id`,`source_record_key`);--> statement-breakpoint
CREATE INDEX `relic_reward_relic` ON `relic_rewards` (`relic_id`,`refinement`);--> statement-breakpoint
CREATE INDEX `relic_reward_reward` ON `relic_rewards` (`reward_id`);--> statement-breakpoint
CREATE TABLE `vendor_offerings` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`item_id` text NOT NULL,
	`faction` text NOT NULL,
	`currency` text NOT NULL,
	`cost` integer NOT NULL,
	`quantity` integer NOT NULL,
	`prerequisite_rank` integer,
	`prerequisite_label` text,
	`source_run_id` text NOT NULL,
	`source_record_key` text NOT NULL,
	`citation_url` text,
	`source_path` text,
	FOREIGN KEY (`vendor_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_run_id`) REFERENCES `source_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendor_offering_run_record` ON `vendor_offerings` (`source_run_id`,`source_record_key`);--> statement-breakpoint
CREATE INDEX `vendor_offering_vendor` ON `vendor_offerings` (`vendor_id`);--> statement-breakpoint
CREATE INDEX `vendor_offering_item` ON `vendor_offerings` (`item_id`);