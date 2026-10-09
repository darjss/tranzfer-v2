CREATE TABLE `signup` (
	`ip` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
-- Carry the sign-ups still inside the new-accounts window over from user.signup_ip.
INSERT INTO `signup` (`ip`, `created_at`) SELECT `signup_ip`, `created_at` FROM `user` WHERE `signup_ip` IS NOT NULL AND `created_at` > (cast(unixepoch('subsecond') * 1000 as integer)) - 86400000;--> statement-breakpoint
DROP INDEX IF EXISTS `user_signupIp_createdAt_idx`;--> statement-breakpoint
CREATE INDEX `signup_ip_createdAt_idx` ON `signup` (`ip`,`created_at`);--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `signup_ip`;