ALTER TABLE `workspace` ADD `status_emails` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `changelog_entry` ADD `emailed_at` integer;
--> statement-breakpoint
UPDATE `changelog_entry` SET `emailed_at` = `published_at` WHERE `published_at` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `changelog_subscriber` (
	`workspace_id` text NOT NULL REFERENCES `workspace`(`id`) ON DELETE cascade,
	`email` text NOT NULL,
	`confirmed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`workspace_id`, `email`)
);
--> statement-breakpoint
CREATE TABLE `email_optout` (
	`workspace_id` text NOT NULL REFERENCES `workspace`(`id`) ON DELETE cascade,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`workspace_id`, `email`, `kind`)
);
