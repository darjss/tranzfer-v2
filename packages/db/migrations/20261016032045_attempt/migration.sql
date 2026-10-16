CREATE TABLE `attempt` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`ip` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempt_kind_key_createdAt_idx` ON `attempt` (`kind`,`key`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempt_kind_ip_createdAt_idx` ON `attempt` (`kind`,`ip`,`created_at`);