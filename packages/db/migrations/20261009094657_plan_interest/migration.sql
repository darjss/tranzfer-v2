CREATE TABLE `plan_interest` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`email` text NOT NULL,
	`plan` text NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`notify_queued_at` integer,
	`notified_at` integer,
	CONSTRAINT `fk_plan_interest_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_interest_email_plan_unique` ON `plan_interest` (`email`,`plan`);--> statement-breakpoint
CREATE INDEX `plan_interest_notifyQueuedAt_idx` ON `plan_interest` (`notify_queued_at`);