CREATE UNIQUE INDEX `attachment_key_idx` ON `attachment` (`key`);
--> statement-breakpoint
CREATE INDEX `attachment_uploader_created_idx` ON `attachment` (`uploader_id`,`created_at`);
