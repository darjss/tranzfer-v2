CREATE TABLE `subscription` (
	`user_id` text PRIMARY KEY,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`polar_customer_id` text,
	`polar_subscription_id` text,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_subscription_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
