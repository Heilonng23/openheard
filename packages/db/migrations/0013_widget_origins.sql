ALTER TABLE `workspace` ADD `widget_origins` text;
CREATE TABLE `widget_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
	`workspace_id` text NOT NULL REFERENCES `workspace`(`id`) ON DELETE cascade,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE INDEX `widget_token_user_idx` ON `widget_token` (`user_id`);
