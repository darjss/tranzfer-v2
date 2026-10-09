CREATE TABLE `file_request` (
	`id` text PRIMARY KEY,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`retention_days` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`max_bytes` integer,
	`closed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_file_request_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
ALTER TABLE `delivery` ADD `request_id` text REFERENCES file_request(id);--> statement-breakpoint
ALTER TABLE `delivery` ADD `uploader_name` text;--> statement-breakpoint
ALTER TABLE `delivery` ADD `uploader_email` text;--> statement-breakpoint
CREATE INDEX `delivery_requestId_idx` ON `delivery` (`request_id`);--> statement-breakpoint
CREATE INDEX `file_request_ownerId_createdAt_idx` ON `file_request` (`owner_id`,`created_at`);