CREATE TABLE `delivery_email` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`delivery_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	CONSTRAINT `fk_delivery_email_delivery_id_delivery_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `delivery`(`id`)
);
--> statement-breakpoint
CREATE INDEX `delivery_email_deliveryId_idx` ON `delivery_email` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `delivery_email_createdAt_idx` ON `delivery_email` (`created_at`);