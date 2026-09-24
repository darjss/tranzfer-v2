CREATE TABLE `delivery` (
	`id` text PRIMARY KEY,
	`sender_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`retention_days` integer NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_delivery_sender_id_user_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`)
);
--> statement-breakpoint
CREATE TABLE `link` (
	`id` text PRIMARY KEY,
	`delivery_id` text NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_link_delivery_id_delivery_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `delivery`(`id`)
);
--> statement-breakpoint
CREATE TABLE `transfer` (
	`id` text PRIMARY KEY,
	`delivery_id` text NOT NULL,
	`object_key` text NOT NULL UNIQUE,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text,
	`source_modified_at` integer NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`etag` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_transfer_delivery_id_delivery_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `delivery`(`id`)
);
--> statement-breakpoint
CREATE INDEX `delivery_senderId_createdAt_idx` ON `delivery` (`sender_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `link_deliveryId_idx` ON `link` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `transfer_deliveryId_idx` ON `transfer` (`delivery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_deliveryId_path_unique` ON `transfer` (`delivery_id`,`path`);