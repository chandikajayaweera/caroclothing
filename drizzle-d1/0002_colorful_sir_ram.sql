CREATE TABLE `promotion` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`public_title` text,
	`internal_description` text,
	`public_description` text,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`min_order_amount` integer,
	`max_discount_amount` integer,
	`usage_limit` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`per_user_limit` integer DEFAULT 1 NOT NULL,
	`application_mode` text NOT NULL,
	`eligibility_scope` text DEFAULT 'all' NOT NULL,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "promotion_discount_value_valid" CHECK("promotion"."discount_value" > 0 AND ("promotion"."discount_type" <> 'percentage' OR "promotion"."discount_value" <= 100)),
	CONSTRAINT "promotion_amounts_valid" CHECK(("promotion"."min_order_amount" IS NULL OR "promotion"."min_order_amount" >= 0) AND ("promotion"."max_discount_amount" IS NULL OR "promotion"."max_discount_amount" > 0)),
	CONSTRAINT "promotion_usage_counts_valid" CHECK("promotion"."used_count" >= 0 AND ("promotion"."usage_limit" IS NULL OR "promotion"."usage_limit" > 0) AND "promotion"."per_user_limit" > 0),
	CONSTRAINT "promotion_priority_nonnegative" CHECK("promotion"."priority" >= 0),
	CONSTRAINT "promotion_expiry_after_start" CHECK("promotion"."starts_at" IS NULL OR "promotion"."expires_at" IS NULL OR "promotion"."expires_at" > "promotion"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `promotion_active_window_idx` ON `promotion` (`is_active`,`starts_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `promotion_application_priority_idx` ON `promotion` (`application_mode`,`priority`);--> statement-breakpoint
CREATE INDEX `promotion_visibility_idx` ON `promotion` (`visibility`);--> statement-breakpoint
INSERT INTO `promotion` (
	`id`, `name`, `internal_description`, `discount_type`, `discount_value`,
	`min_order_amount`, `max_discount_amount`, `usage_limit`, `used_count`,
	`per_user_limit`, `application_mode`, `eligibility_scope`, `visibility`,
	`priority`, `is_active`, `starts_at`, `expires_at`, `created_at`, `updated_at`
)
SELECT
	`id`, `code`, `description`, `discount_type`, `discount_value`,
	`min_order_amount`, `max_discount_amount`, `usage_limit`, `used_count`,
	`per_user_limit`, 'code', 'all', 'internal', 0, `is_active`,
	`starts_at`, `expires_at`, `created_at`, `updated_at`
FROM `promo_code`;--> statement-breakpoint
CREATE TABLE `promotion_customer_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`promotion_id` text NOT NULL,
	`user_id` text NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotion`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "promotion_customer_grant_window_valid" CHECK("promotion_customer_grant"."starts_at" IS NULL OR "promotion_customer_grant"."expires_at" IS NULL OR "promotion_customer_grant"."expires_at" > "promotion_customer_grant"."starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_customer_grant_unique_idx` ON `promotion_customer_grant` (`promotion_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `promotion_customer_grant_user_idx` ON `promotion_customer_grant` (`user_id`);--> statement-breakpoint
CREATE TABLE `storefront_section` (
	`id` text PRIMARY KEY NOT NULL,
	`page_key` text DEFAULT 'home' NOT NULL,
	`type` text NOT NULL,
	`admin_name` text NOT NULL,
	`layout_variant` text NOT NULL,
	`source_type` text NOT NULL,
	`eyebrow` text,
	`title` text,
	`body` text,
	`primary_cta_label` text,
	`primary_cta_url` text,
	`secondary_cta_label` text,
	`secondary_cta_url` text,
	`product_id` text,
	`category_id` text,
	`promotion_id` text,
	`shipping_method_id` text,
	`item_limit` integer DEFAULT 8 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`promotion_id`) REFERENCES `promotion`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shipping_method_id`) REFERENCES `shipping_method`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "storefront_section_item_limit_range" CHECK("storefront_section"."item_limit" BETWEEN 1 AND 12),
	CONSTRAINT "storefront_section_sort_nonnegative" CHECK("storefront_section"."sort_order" >= 0),
	CONSTRAINT "storefront_section_window_valid" CHECK("storefront_section"."starts_at" IS NULL OR "storefront_section"."ends_at" IS NULL OR "storefront_section"."ends_at" > "storefront_section"."starts_at"),
	CONSTRAINT "storefront_section_cta_pairs" CHECK(("storefront_section"."primary_cta_label" IS NULL) = ("storefront_section"."primary_cta_url" IS NULL) AND ("storefront_section"."secondary_cta_label" IS NULL) = ("storefront_section"."secondary_cta_url" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storefront_section_page_sort_unique_idx` ON `storefront_section` (`page_key`,`sort_order`);--> statement-breakpoint
CREATE INDEX `storefront_section_visibility_idx` ON `storefront_section` (`page_key`,`enabled`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `storefront_section_type_idx` ON `storefront_section` (`type`);--> statement-breakpoint
CREATE TABLE `storefront_section_category` (
	`section_id` text NOT NULL,
	`category_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`section_id`, `category_id`),
	FOREIGN KEY (`section_id`) REFERENCES `storefront_section`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "storefront_section_category_position_nonnegative" CHECK("storefront_section_category"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storefront_section_category_position_unique_idx` ON `storefront_section_category` (`section_id`,`position`);--> statement-breakpoint
CREATE INDEX `storefront_section_category_category_idx` ON `storefront_section_category` (`category_id`);--> statement-breakpoint
CREATE TABLE `storefront_section_media` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`role` text NOT NULL,
	`r2_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`original_filename` text,
	`width` integer,
	`height` integer,
	`alt_text` text,
	`focal_x` integer DEFAULT 50 NOT NULL,
	`focal_y` integer DEFAULT 50 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `storefront_section`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "storefront_section_media_byte_size_positive" CHECK("storefront_section_media"."byte_size" > 0),
	CONSTRAINT "storefront_section_media_dimensions_positive" CHECK(("storefront_section_media"."width" IS NULL OR "storefront_section_media"."width" > 0) AND ("storefront_section_media"."height" IS NULL OR "storefront_section_media"."height" > 0)),
	CONSTRAINT "storefront_section_media_focal_range" CHECK("storefront_section_media"."focal_x" BETWEEN 0 AND 100 AND "storefront_section_media"."focal_y" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storefront_section_media_role_unique_idx` ON `storefront_section_media` (`section_id`,`role`);--> statement-breakpoint
CREATE INDEX `storefront_section_media_section_idx` ON `storefront_section_media` (`section_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `storefront_section_media_r2_key_unique_idx` ON `storefront_section_media` (`r2_key`);--> statement-breakpoint
INSERT INTO `storefront_section` (
	`id`, `page_key`, `type`, `admin_name`, `layout_variant`, `source_type`,
	`eyebrow`, `title`, `body`, `primary_cta_label`, `primary_cta_url`,
	`item_limit`, `sort_order`, `enabled`
) VALUES
	('home-hero', 'home', 'hero', 'Homepage hero', 'full_bleed', 'manual', 'CARO CLOTHING', 'Built for the next move.', 'Limited silhouettes. Everyday essentials. Designed in Sri Lanka.', 'Shop new arrivals', '/shop?sort=newest', 1, 0, true),
	('home-new-arrivals', 'home', 'product_grid', 'New arrivals', 'grid_4', 'new_arrivals', 'LATEST RELEASES', 'New arrivals', 'Fresh pieces, selected from the live catalogue.', 'Shop all', '/shop?sort=newest', 8, 1, true),
	('home-categories', 'home', 'category_showcase', 'Shop categories', 'grid_3', 'root_categories', 'FIND YOUR FIT', 'Shop by category', NULL, NULL, NULL, 6, 2, true),
	('home-reviews', 'home', 'review_rail', 'Customer reviews', 'rail', 'recent_reviews', 'WORN OUTSIDE', 'From the community', NULL, NULL, NULL, 8, 3, true),
	('home-service', 'home', 'service_strip', 'Service promises', 'compact', 'manual', 'CARO SERVICE', 'Straightforward delivery. Real support.', 'Islandwide delivery and clear order updates from checkout to arrival.', NULL, NULL, 3, 4, true);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_promo_code_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`promotion_id` text,
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
INSERT INTO `__new_promo_code_usage`("id", "promotion_id", "promo_code_id", "user_id", "order_id", "discount_amount", "used_at") SELECT "id", "promo_code_id", "promo_code_id", "user_id", "order_id", "discount_amount", "used_at" FROM `promo_code_usage`;--> statement-breakpoint
DROP TABLE `promo_code_usage`;--> statement-breakpoint
ALTER TABLE `__new_promo_code_usage` RENAME TO `promo_code_usage`;--> statement-breakpoint
CREATE INDEX `promotion_usage_promotion_idx` ON `promo_code_usage` (`promotion_id`);--> statement-breakpoint
CREATE INDEX `promotion_usage_code_idx` ON `promo_code_usage` (`promo_code_id`);--> statement-breakpoint
CREATE INDEX `promotion_usage_user_idx` ON `promo_code_usage` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotion_usage_order_unique_idx` ON `promo_code_usage` (`order_id`);--> statement-breakpoint
CREATE INDEX `promotion_usage_per_user_idx` ON `promo_code_usage` (`promotion_id`,`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `promo_code` ADD `promotion_id` text REFERENCES promotion(id);--> statement-breakpoint
ALTER TABLE `promo_code` ADD `distribution` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `promo_code` ADD `is_discoverable` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `promo_code` ADD `redemption_channel` text DEFAULT 'storefront' NOT NULL;--> statement-breakpoint
ALTER TABLE `promo_code` ADD `partner_reference` text;--> statement-breakpoint
UPDATE `promo_code` SET `promotion_id` = `id`;--> statement-breakpoint
CREATE INDEX `promo_code_promotion_idx` ON `promo_code` (`promotion_id`);--> statement-breakpoint
CREATE INDEX `promo_code_active_discoverable_idx` ON `promo_code` (`is_active`,`is_discoverable`);--> statement-breakpoint
ALTER TABLE `bag` ADD `promotion_id` text REFERENCES promotion(id);--> statement-breakpoint
UPDATE `bag` SET `promotion_id` = `promo_code_id` WHERE `promo_code_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `promotion_id` text REFERENCES promotion(id);--> statement-breakpoint
UPDATE `orders` SET `promotion_id` = `promo_code_id` WHERE `promo_code_id` IS NOT NULL;
