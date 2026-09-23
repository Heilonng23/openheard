CREATE TABLE `help_collection` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`icon` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_collection_slug_uidx` ON `help_collection` (`workspace_id`,`slug`);
--> statement-breakpoint
CREATE TABLE `help_article` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` integer,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`helpful_count` integer DEFAULT 0 NOT NULL,
	`unhelpful_count` integer DEFAULT 0 NOT NULL,
	`author_id` text,
	`published_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `help_collection`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_article_slug_uidx` ON `help_article` (`workspace_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `help_article_ws_status_idx` ON `help_article` (`workspace_id`,`status`);
--> statement-breakpoint
CREATE INDEX `help_article_collection_idx` ON `help_article` (`collection_id`);
--> statement-breakpoint
CREATE TABLE `help_article_feedback` (
	`article_id` integer NOT NULL,
	`voter` text NOT NULL,
	`helpful` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`article_id`, `voter`),
	FOREIGN KEY (`article_id`) REFERENCES `help_article`(`id`) ON UPDATE no action ON DELETE cascade
);
