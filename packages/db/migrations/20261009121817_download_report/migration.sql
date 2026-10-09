CREATE TABLE `download` (
	`transfer_id` text PRIMARY KEY,
	`delivery_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`saved_at` integer,
	CONSTRAINT `fk_download_transfer_id_transfer_id_fk` FOREIGN KEY (`transfer_id`) REFERENCES `transfer`(`id`),
	CONSTRAINT `fk_download_delivery_id_delivery_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `delivery`(`id`)
);
--> statement-breakpoint
CREATE INDEX `download_deliveryId_idx` ON `download` (`delivery_id`);