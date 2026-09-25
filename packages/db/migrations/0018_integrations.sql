CREATE TABLE `integration` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspace`(`id`) ON DELETE cascade,
	`kind` text NOT NULL,
	`url_enc` text NOT NULL,
	`url_hint` text NOT NULL,
	`secret_enc` text,
	`events` text NOT NULL,
	`board_ids` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_status` text,
	`last_error` text,
	`last_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_workspace_kind_idx` ON `integration` (`workspace_id`,`kind`);
