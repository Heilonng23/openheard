CREATE TABLE `status` (
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`color` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`on_roadmap` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`workspace_id`, `key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `status` (`workspace_id`, `key`, `label`, `color`, `kind`, `position`, `on_roadmap`)
SELECT `id`, 'open', 'Pending', '#f2b53d', 'open', 0, 0 FROM `workspace`;
--> statement-breakpoint
INSERT INTO `status` (`workspace_id`, `key`, `label`, `color`, `kind`, `position`, `on_roadmap`)
SELECT `id`, 'review', 'Under review', '#b08cff', 'review', 1, 1 FROM `workspace`;
--> statement-breakpoint
INSERT INTO `status` (`workspace_id`, `key`, `label`, `color`, `kind`, `position`, `on_roadmap`)
SELECT `id`, 'planned', 'Planned', '#f2b53d', 'planned', 2, 1 FROM `workspace`;
--> statement-breakpoint
INSERT INTO `status` (`workspace_id`, `key`, `label`, `color`, `kind`, `position`, `on_roadmap`)
SELECT `id`, 'progress', 'In progress', '#6e8bff', 'progress', 3, 1 FROM `workspace`;
--> statement-breakpoint
INSERT INTO `status` (`workspace_id`, `key`, `label`, `color`, `kind`, `position`, `on_roadmap`)
SELECT `id`, 'done', 'Shipped', '#3ecf8e', 'done', 4, 1 FROM `workspace`;
--> statement-breakpoint
INSERT INTO `status` (`workspace_id`, `key`, `label`, `color`, `kind`, `position`, `on_roadmap`)
SELECT `id`, 'closed', 'Closed', '#7a7a85', 'closed', 5, 0 FROM `workspace`;
