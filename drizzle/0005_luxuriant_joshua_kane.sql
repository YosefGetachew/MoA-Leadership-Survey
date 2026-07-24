ALTER TABLE `feedback` ADD `respondent_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_respondent_training_idx` ON `feedback` (`respondent_token`,`training_title`,`training_date`);