CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`hash` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `api_key_workspace_idx` ON `api_key` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `membership` ADD `notify_new_post` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `membership` ADD `notify_comment` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `membership` ADD `notify_status` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace` ADD `who_can_post` text DEFAULT 'anyone' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace` ADD `anonymous_voting` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace` ADD `show_roadmap` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace` ADD `show_changelog` integer DEFAULT true NOT NULL;