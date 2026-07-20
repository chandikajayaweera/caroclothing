PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_promo_code` (
	`id` text PRIMARY KEY NOT NULL,
	`promotion_id` text NOT NULL,
	`code` text NOT NULL,
	`distribution` text DEFAULT 'private' NOT NULL,
	`is_discoverable` integer DEFAULT false NOT NULL,
	`redemption_channel` text DEFAULT 'storefront' NOT NULL,
	`partner_reference` text,
	`usage_limit` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotion`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "promo_code_usage_counts_valid" CHECK("__new_promo_code"."used_count" >= 0 AND ("__new_promo_code"."usage_limit" IS NULL OR "__new_promo_code"."usage_limit" > 0))
);
--> statement-breakpoint
INSERT INTO `__new_promo_code`("id", "promotion_id", "code", "distribution", "is_discoverable", "redemption_channel", "partner_reference", "usage_limit", "used_count", "is_active", "created_at", "updated_at") SELECT "id", "promotion_id", "code", "distribution", "is_discoverable", "redemption_channel", "partner_reference", "usage_limit", "used_count", "is_active", "created_at", "updated_at" FROM `promo_code`;--> statement-breakpoint
DROP TABLE `promo_code`;--> statement-breakpoint
ALTER TABLE `__new_promo_code` RENAME TO `promo_code`;--> statement-breakpoint
UPDATE `promo_code_usage`
SET `promo_code_id` = `promotion_id`
WHERE `promotion_id` IS NOT NULL
	AND EXISTS (SELECT 1 FROM `promo_code` WHERE `promo_code`.`id` = `promo_code_usage`.`promotion_id`);--> statement-breakpoint
UPDATE `bag`
SET `promo_code_id` = `promotion_id`
WHERE `promotion_id` IS NOT NULL
	AND EXISTS (SELECT 1 FROM `promo_code` WHERE `promo_code`.`id` = `bag`.`promotion_id`);--> statement-breakpoint
UPDATE `orders`
SET `promo_code_id` = `promotion_id`
WHERE `promotion_id` IS NOT NULL
	AND EXISTS (SELECT 1 FROM `promo_code` WHERE `promo_code`.`id` = `orders`.`promotion_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `promo_code_code_unique` ON `promo_code` (`code`);--> statement-breakpoint
CREATE INDEX `promo_code_promotion_idx` ON `promo_code` (`promotion_id`);--> statement-breakpoint
CREATE INDEX `promo_code_active_discoverable_idx` ON `promo_code` (`is_active`,`is_discoverable`);--> statement-breakpoint
CREATE TABLE `__new_promo_code_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`promotion_id` text NOT NULL,
	`promo_code_id` text,
	`user_id` text,
	`order_id` text NOT NULL,
	`discount_amount` integer NOT NULL,
	`used_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotion`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_code`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "promotion_usage_discount_nonnegative" CHECK("__new_promo_code_usage"."discount_amount" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_promo_code_usage`("id", "promotion_id", "promo_code_id", "user_id", "order_id", "discount_amount", "used_at") SELECT "id", "promotion_id", "promo_code_id", "user_id", "order_id", "discount_amount", "used_at" FROM `promo_code_usage`;--> statement-breakpoint
DROP TABLE `promo_code_usage`;--> statement-breakpoint
ALTER TABLE `__new_promo_code_usage` RENAME TO `promo_code_usage`;--> statement-breakpoint
CREATE INDEX `promotion_usage_promotion_idx` ON `promo_code_usage` (`promotion_id`);--> statement-breakpoint
CREATE INDEX `promotion_usage_code_idx` ON `promo_code_usage` (`promo_code_id`);--> statement-breakpoint
CREATE INDEX `promotion_usage_user_idx` ON `promo_code_usage` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_usage_order_unique_idx` ON `promo_code_usage` (`order_id`);--> statement-breakpoint
CREATE INDEX `promotion_usage_per_user_idx` ON `promo_code_usage` (`promotion_id`,`user_id`);
