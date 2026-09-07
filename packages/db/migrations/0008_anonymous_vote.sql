CREATE TABLE `anonymous_vote` (
	`post_id` integer NOT NULL REFERENCES `post`(`id`) ON DELETE cascade,
	`anon_token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`post_id`, `anon_token`)
);
