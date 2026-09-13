ALTER TABLE `user` ADD `plan` text DEFAULT 'free' NOT NULL;
ALTER TABLE `user` ADD `stripe_customer_id` text;
ALTER TABLE `user` ADD `stripe_subscription_id` text;
ALTER TABLE `user` ADD `plan_renews_at` integer;
