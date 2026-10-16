CREATE TABLE `research_preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'demo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
