ALTER TABLE `user` ADD `signup_ip` text;--> statement-breakpoint
CREATE INDEX `user_signupIp_createdAt_idx` ON `user` (`signup_ip`,`created_at`);