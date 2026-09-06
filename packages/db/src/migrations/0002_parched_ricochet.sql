CREATE TABLE `membership` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `membership_user_idx` ON `membership` (`user_id`);--> statement-breakpoint
ALTER TABLE `board` ADD `workspace_id` text DEFAULT 'default' NOT NULL REFERENCES workspace(id);--> statement-breakpoint
ALTER TABLE `changelog_entry` ADD `workspace_id` text DEFAULT 'default' NOT NULL REFERENCES workspace(id);--> statement-breakpoint
ALTER TABLE `post` ADD `workspace_id` text DEFAULT 'default' NOT NULL REFERENCES workspace(id);--> statement-breakpoint
CREATE INDEX `post_workspace_idx` ON `post` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `tag` ADD `workspace_id` text DEFAULT 'default' NOT NULL REFERENCES workspace(id);--> statement-breakpoint
ALTER TABLE `workspace` ADD `created_at` integer DEFAULT 0 NOT NULL;