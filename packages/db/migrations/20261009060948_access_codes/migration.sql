CREATE TABLE `access_code` (
	`code` text PRIMARY KEY,
	`plan` text NOT NULL,
	`days` integer NOT NULL,
	`max_uses` integer NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "access_code_uses_within_max" CHECK("uses" <= "max_uses")
);
--> statement-breakpoint
CREATE TABLE `plan_grant` (
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`plan` text NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `plan_grant_pk` PRIMARY KEY(`user_id`, `code`),
	CONSTRAINT `fk_plan_grant_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_plan_grant_code_access_code_code_fk` FOREIGN KEY (`code`) REFERENCES `access_code`(`code`)
);
