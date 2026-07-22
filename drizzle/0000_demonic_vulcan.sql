CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`training_title` text NOT NULL,
	`training_date` text NOT NULL,
	`participant_name` text,
	`department` text,
	`overall_rating` integer NOT NULL,
	`clarity_rating` integer NOT NULL,
	`relevance_rating` integer NOT NULL,
	`confidence_rating` integer NOT NULL,
	`recommend_score` integer NOT NULL,
	`highlight` text,
	`improvement` text,
	`anonymous` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
