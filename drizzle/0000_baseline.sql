CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`is_anonymous` integer DEFAULT false,
	`phone_number` text,
	`phone_number_verified` integer,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_phone_number_unique` ON `user` (`phone_number`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `address` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`label` text,
	`recipient_name` text NOT NULL,
	`phone` text NOT NULL,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`city` text NOT NULL,
	`district` text NOT NULL,
	`postal_code` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "default_requires_user" CHECK("address"."user_id" IS NOT NULL OR "address"."is_default" = 0)
);
--> statement-breakpoint
CREATE INDEX `address_user_idx` ON `address` (`user_id`);--> statement-breakpoint
CREATE INDEX `address_user_default_idx` ON `address` (`user_id`,`is_default`);--> statement-breakpoint
CREATE UNIQUE INDEX `address_one_default_per_user` ON `address` (`user_id`) WHERE "address"."is_default" = 1 AND "address"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `bag` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`session_token` text,
	`promo_code_id` text,
	`expires_at` integer,
	`checkout_started_at` integer,
	`checkout_expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_code`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bag_has_one_owner" CHECK(("bag"."user_id" IS NOT NULL AND "bag"."session_token" IS NULL) OR ("bag"."user_id" IS NULL AND "bag"."session_token" IS NOT NULL)),
	CONSTRAINT "bag_expiry_positive" CHECK("bag"."expires_at" IS NULL OR "bag"."expires_at" > 0),
	CONSTRAINT "bag_checkout_timestamps_paired" CHECK(("bag"."checkout_started_at" IS NULL AND "bag"."checkout_expires_at" IS NULL) OR ("bag"."checkout_started_at" IS NOT NULL AND "bag"."checkout_expires_at" IS NOT NULL)),
	CONSTRAINT "bag_checkout_expiry_after_start" CHECK("bag"."checkout_expires_at" IS NULL OR "bag"."checkout_expires_at" > "bag"."checkout_started_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bag_session_token_unique` ON `bag` (`session_token`);--> statement-breakpoint
CREATE INDEX `bag_user_idx` ON `bag` (`user_id`);--> statement-breakpoint
CREATE INDEX `bag_session_idx` ON `bag` (`session_token`);--> statement-breakpoint
CREATE INDEX `bag_expires_idx` ON `bag` (`expires_at`);--> statement-breakpoint
CREATE INDEX `bag_checkout_expires_idx` ON `bag` (`checkout_expires_at`);--> statement-breakpoint
CREATE TABLE `bag_item` (
	`id` text PRIMARY KEY NOT NULL,
	`bag_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` integer NOT NULL,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`bag_id`) REFERENCES `bag`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bag_item_quantity_range" CHECK("bag_item"."quantity" BETWEEN 1 AND 10),
	CONSTRAINT "bag_item_unit_price_positive" CHECK("bag_item"."unit_price" > 0)
);
--> statement-breakpoint
CREATE INDEX `bag_item_bag_idx` ON `bag_item` (`bag_id`);--> statement-breakpoint
CREATE INDEX `bag_item_variant_idx` ON `bag_item` (`variant_id`);--> statement-breakpoint
CREATE INDEX `bag_item_product_idx` ON `bag_item` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bag_item_bag_variant_idx` ON `bag_item` (`bag_id`,`variant_id`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`reserved_quantity` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` integer DEFAULT 5 NOT NULL,
	`track_inventory` integer DEFAULT true NOT NULL,
	`allow_backorder` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reserved_not_exceed_quantity" CHECK("inventory"."quantity" >= 0 AND "inventory"."reserved_quantity" >= 0 AND "inventory"."reserved_quantity" <= "inventory"."quantity"),
	CONSTRAINT "inventory_low_stock_threshold_nonnegative" CHECK("inventory"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_variant_id_unique` ON `inventory` (`variant_id`);--> statement-breakpoint
CREATE INDEX `inventory_low_stock_idx` ON `inventory` (`track_inventory`,`quantity`,`low_stock_threshold`);--> statement-breakpoint
CREATE TABLE `inventory_movement` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity_delta` integer DEFAULT 0 NOT NULL,
	`quantity_after` integer NOT NULL,
	`reserved_quantity_delta` integer DEFAULT 0 NOT NULL,
	`reserved_quantity_after` integer NOT NULL,
	`reference_id` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inv_movement_delta_nonzero" CHECK("inventory_movement"."quantity_delta" <> 0 OR "inventory_movement"."reserved_quantity_delta" <> 0),
	CONSTRAINT "inv_movement_quantity_after_nonnegative" CHECK("inventory_movement"."quantity_after" >= 0),
	CONSTRAINT "inv_movement_reserved_after_nonnegative" CHECK("inventory_movement"."reserved_quantity_after" >= 0)
);
--> statement-breakpoint
CREATE INDEX `inv_movement_variant_idx` ON `inventory_movement` (`variant_id`);--> statement-breakpoint
CREATE INDEX `inv_movement_type_idx` ON `inventory_movement` (`type`);--> statement-breakpoint
CREATE INDEX `inv_movement_ref_idx` ON `inventory_movement` (`reference_id`);--> statement-breakpoint
CREATE INDEX `inv_movement_created_idx` ON `inventory_movement` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`type` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`recipient` text NOT NULL,
	`recipient_user_id` text,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text,
	`payload_json` text NOT NULL,
	`metadata_json` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`next_attempt_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_attempt_at` integer,
	`locked_at` integer,
	`locked_by` text,
	`lock_token` text,
	`last_error` text,
	`provider` text,
	`provider_message_id` text,
	`sent_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notification_outbox_attempts_valid" CHECK("notification_outbox"."attempt_count" >= 0 AND "notification_outbox"."max_attempts" > 0 AND "notification_outbox"."attempt_count" <= "notification_outbox"."max_attempts"),
	CONSTRAINT "notification_outbox_next_attempt_positive" CHECK("notification_outbox"."next_attempt_at" > 0),
	CONSTRAINT "notification_outbox_processing_lock_valid" CHECK(("notification_outbox"."status" = 'processing' AND "notification_outbox"."locked_at" IS NOT NULL AND "notification_outbox"."locked_by" IS NOT NULL AND "notification_outbox"."lock_token" IS NOT NULL) OR ("notification_outbox"."status" <> 'processing' AND "notification_outbox"."locked_at" IS NULL AND "notification_outbox"."locked_by" IS NULL AND "notification_outbox"."lock_token" IS NULL)),
	CONSTRAINT "notification_outbox_sent_state_valid" CHECK("notification_outbox"."status" <> 'sent' OR "notification_outbox"."sent_at" IS NOT NULL),
	CONSTRAINT "notification_outbox_cancelled_state_valid" CHECK("notification_outbox"."status" <> 'cancelled' OR "notification_outbox"."cancelled_at" IS NOT NULL),
	CONSTRAINT "outbox_payload_valid" CHECK(json_valid("notification_outbox"."payload_json")),
	CONSTRAINT "outbox_metadata_valid" CHECK("notification_outbox"."metadata_json" IS NULL OR json_valid("notification_outbox"."metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_outbox_idempotency_unique_idx` ON `notification_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `notification_outbox_status_next_idx` ON `notification_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notification_outbox_status_lock_idx` ON `notification_outbox` (`status`,`locked_at`);--> statement-breakpoint
CREATE INDEX `notification_outbox_aggregate_idx` ON `notification_outbox` (`aggregate_type`,`aggregate_id`);--> statement-breakpoint
CREATE INDEX `notification_outbox_user_status_idx` ON `notification_outbox` (`recipient_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `notification_outbox_type_channel_status_idx` ON `notification_outbox` (`type`,`channel`,`status`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_expires_at` integer,
	`subtotal` integer NOT NULL,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`shipping_amount` integer DEFAULT 0 NOT NULL,
	`total_amount` integer NOT NULL,
	`promo_code_id` text,
	`promo_code_snapshot` text,
	`shipping_method_id` text,
	`shipping_address_id` text,
	`shipping_method_snapshot` text,
	`shipping_address_snapshot` text,
	`tracking_number` text,
	`tracking_carrier` text,
	`tracking_url` text,
	`customer_note` text,
	`admin_note` text,
	`confirmed_at` integer,
	`shipped_at` integer,
	`delivered_at` integer,
	`cancelled_at` integer,
	`refunded_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_code`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shipping_method_id`) REFERENCES `shipping_method`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`shipping_address_id`) REFERENCES `address`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_amounts_nonnegative" CHECK("orders"."subtotal" >= 0 AND "orders"."discount_amount" >= 0 AND "orders"."shipping_amount" >= 0 AND "orders"."total_amount" >= 0),
	CONSTRAINT "order_total_matches_parts" CHECK("orders"."total_amount" = ("orders"."subtotal" - "orders"."discount_amount" + "orders"."shipping_amount")),
	CONSTRAINT "order_payment_expiry_positive" CHECK("orders"."payment_expires_at" IS NULL OR "orders"."payment_expires_at" > 0),
	CONSTRAINT "order_promo_snapshot_valid" CHECK("orders"."promo_code_snapshot" IS NULL OR json_valid("orders"."promo_code_snapshot")),
	CONSTRAINT "order_shipping_method_snapshot_valid" CHECK("orders"."shipping_method_snapshot" IS NULL OR json_valid("orders"."shipping_method_snapshot")),
	CONSTRAINT "order_shipping_address_snapshot_valid" CHECK("orders"."shipping_address_snapshot" IS NULL OR json_valid("orders"."shipping_address_snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `order_user_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `order_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `order_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_status_payment_expiry_idx` ON `orders` (`status`,`payment_expires_at`);--> statement-breakpoint
CREATE INDEX `order_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `order_item` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`variant_id` text,
	`product_id` text,
	`product_name` text NOT NULL,
	`variant_size` text NOT NULL,
	`variant_color` text NOT NULL,
	`product_image_r2_key` text,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`total_price` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_item_quantity_positive" CHECK("order_item"."quantity" > 0),
	CONSTRAINT "order_item_prices_valid" CHECK("order_item"."unit_price" > 0 AND "order_item"."total_price" > 0 AND "order_item"."total_price" = ("order_item"."quantity" * "order_item"."unit_price"))
);
--> statement-breakpoint
CREATE INDEX `order_item_order_idx` ON `order_item` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_item_variant_idx` ON `order_item` (`variant_id`);--> statement-breakpoint
CREATE INDEX `order_item_product_idx` ON `order_item` (`product_id`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "order_status_history_changes_status" CHECK("order_status_history"."from_status" IS NULL OR "order_status_history"."from_status" <> "order_status_history"."to_status")
);
--> statement-breakpoint
CREATE INDEX `order_status_history_order_idx` ON `order_status_history` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_status_history_created_idx` ON `order_status_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `payment` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`transaction_id` text,
	`gateway_response` text,
	`refund_amount` integer,
	`refunded_at` integer,
	`paid_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payment_amount_positive" CHECK("payment"."amount" > 0),
	CONSTRAINT "payment_refund_valid" CHECK("payment"."refund_amount" IS NULL OR ("payment"."refund_amount" >= 0 AND "payment"."refund_amount" <= "payment"."amount")),
	CONSTRAINT "payment_gateway_response_valid" CHECK("payment"."gateway_response" IS NULL OR json_valid("payment"."gateway_response"))
);
--> statement-breakpoint
CREATE INDEX `payment_order_idx` ON `payment` (`order_id`);--> statement-breakpoint
CREATE INDEX `payment_status_idx` ON `payment` (`status`);--> statement-breakpoint
CREATE INDEX `payment_transaction_idx` ON `payment` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`image_r2_key` text,
	`image_mime_type` text,
	`image_byte_size` integer,
	`image_original_filename` text,
	`image_width` integer,
	`image_height` integer,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "category_sort_nonnegative" CHECK("category"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_parent_idx` ON `category` (`parent_id`);--> statement-breakpoint
CREATE INDEX `category_active_idx` ON `category` (`is_active`);--> statement-breakpoint
CREATE TABLE `color` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hex` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `color_name_unique` ON `color` (`name`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`short_description` text,
	`category_id` text,
	`gender` text DEFAULT 'unisex' NOT NULL,
	`fit` text DEFAULT 'oversized' NOT NULL,
	`material` text,
	`care_instructions` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`is_new_arrival` integer DEFAULT true NOT NULL,
	`meta_title` text,
	`meta_description` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_slug_unique` ON `product` (`slug`);--> statement-breakpoint
CREATE INDEX `product_category_idx` ON `product` (`category_id`);--> statement-breakpoint
CREATE INDEX `product_active_featured_idx` ON `product` (`is_active`,`is_featured`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_gender_active_idx` ON `product` (`gender`,`is_active`);--> statement-breakpoint
CREATE INDEX `product_new_arrival_idx` ON `product` (`is_new_arrival`,`is_active`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_created_idx` ON `product` (`created_at`);--> statement-breakpoint
CREATE TABLE `product_image` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`r2_key` text NOT NULL,
	`mime_type` text,
	`byte_size` integer,
	`original_filename` text,
	`width` integer,
	`height` integer,
	`alt_text` text,
	`position` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant_color`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "image_position_nonnegative" CHECK("product_image"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `image_product_idx` ON `product_image` (`product_id`);--> statement-breakpoint
CREATE INDEX `image_variant_idx` ON `product_image` (`variant_id`);--> statement-breakpoint
CREATE INDEX `image_product_position_idx` ON `product_image` (`product_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_image_one_primary_per_product` ON `product_image` (`product_id`) WHERE "product_image"."is_primary" = 1 AND "product_image"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `product_image_one_primary_per_variant` ON `product_image` (`variant_id`) WHERE "product_image"."is_primary" = 1 AND "product_image"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `product_tag` (
	`product_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_tag_unique_idx` ON `product_tag` (`product_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `product_tag_tag_idx` ON `product_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `product_variant` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`variant_color_id` text NOT NULL,
	`size` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_color_id`) REFERENCES `product_variant_color`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "variant_sort_nonnegative" CHECK("product_variant"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `variant_product_idx` ON `product_variant` (`product_id`);--> statement-breakpoint
CREATE INDEX `variant_color_idx` ON `product_variant` (`variant_color_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `variant_color_size_idx` ON `product_variant` (`variant_color_id`,`size`);--> statement-breakpoint
CREATE INDEX `variant_active_idx` ON `product_variant` (`is_active`);--> statement-breakpoint
CREATE TABLE `product_variant_color` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`color_id` text,
	`color` text NOT NULL,
	`color_hex` text,
	`base_price` integer NOT NULL,
	`compare_at_price` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`color_id`) REFERENCES `color`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "color_base_price_positive" CHECK("product_variant_color"."base_price" > 0),
	CONSTRAINT "color_compare_at_gt_base" CHECK("product_variant_color"."compare_at_price" IS NULL OR "product_variant_color"."compare_at_price" > "product_variant_color"."base_price")
);
--> statement-breakpoint
CREATE INDEX `color_product_idx` ON `product_variant_color` (`product_id`);--> statement-breakpoint
CREATE INDEX `color_global_idx` ON `product_variant_color` (`color_id`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_name_unique` ON `tag` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tag_slug_unique` ON `tag` (`slug`);--> statement-breakpoint
CREATE TABLE `promo_code` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`min_order_amount` integer,
	`max_discount_amount` integer,
	`usage_limit` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`per_user_limit` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`starts_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "promo_discount_value_valid" CHECK("promo_code"."discount_value" > 0 AND ("promo_code"."discount_type" <> 'percentage' OR "promo_code"."discount_value" <= 100)),
	CONSTRAINT "promo_amounts_nonnegative" CHECK(("promo_code"."min_order_amount" IS NULL OR "promo_code"."min_order_amount" >= 0) AND ("promo_code"."max_discount_amount" IS NULL OR "promo_code"."max_discount_amount" > 0)),
	CONSTRAINT "promo_usage_counts_valid" CHECK("promo_code"."used_count" >= 0 AND ("promo_code"."usage_limit" IS NULL OR "promo_code"."usage_limit" > 0) AND "promo_code"."per_user_limit" > 0),
	CONSTRAINT "promo_expiry_after_start" CHECK("promo_code"."starts_at" IS NULL OR "promo_code"."expires_at" IS NULL OR "promo_code"."expires_at" > "promo_code"."starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_code_code_unique` ON `promo_code` (`code`);--> statement-breakpoint
CREATE INDEX `promo_active_expires_idx` ON `promo_code` (`is_active`,`expires_at`);--> statement-breakpoint
CREATE INDEX `promo_starts_idx` ON `promo_code` (`starts_at`);--> statement-breakpoint
CREATE TABLE `promo_code_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`promo_code_id` text NOT NULL,
	`user_id` text,
	`order_id` text NOT NULL,
	`discount_amount` integer NOT NULL,
	`used_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_code`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "promo_usage_discount_nonnegative" CHECK("promo_code_usage"."discount_amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX `promo_usage_code_idx` ON `promo_code_usage` (`promo_code_id`);--> statement-breakpoint
CREATE INDEX `promo_usage_user_idx` ON `promo_code_usage` (`user_id`);--> statement-breakpoint
CREATE INDEX `promo_usage_order_idx` ON `promo_code_usage` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `promo_usage_order_unique_idx` ON `promo_code_usage` (`order_id`);--> statement-breakpoint
CREATE INDEX `promo_usage_per_user_idx` ON `promo_code_usage` (`promo_code_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text,
	`rating` integer NOT NULL,
	`title` text,
	`body` text,
	`is_verified_purchase` integer DEFAULT false NOT NULL,
	`is_approved` integer DEFAULT false NOT NULL,
	`admin_note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "rating_range" CHECK("review"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "review_verified_requires_order" CHECK("review"."is_verified_purchase" = 0 OR "review"."order_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `review_product_idx` ON `review` (`product_id`);--> statement-breakpoint
CREATE INDEX `review_user_idx` ON `review` (`user_id`);--> statement-breakpoint
CREATE INDEX `review_product_approved_idx` ON `review` (`product_id`,`is_approved`,`created_at`);--> statement-breakpoint
CREATE INDEX `review_pending_idx` ON `review` (`is_approved`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_product_user_idx` ON `review` (`product_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `review_media` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`type` text DEFAULT 'image' NOT NULL,
	`mime_type` text,
	`byte_size` integer,
	`original_filename` text,
	`width` integer,
	`height` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_media_position_nonnegative" CHECK("review_media"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `review_media_review_idx` ON `review_media` (`review_id`);--> statement-breakpoint
CREATE INDEX `review_media_position_idx` ON `review_media` (`review_id`,`position`);--> statement-breakpoint
CREATE TABLE `carrier` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`url_template` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carrier_name_unique` ON `carrier` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `carrier_code_unique` ON `carrier` (`code`);--> statement-breakpoint
CREATE INDEX `carrier_active_idx` ON `carrier` (`is_active`);--> statement-breakpoint
CREATE TABLE `shipping_method` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` integer NOT NULL,
	`free_shipping_threshold` integer,
	`estimated_days_min` integer NOT NULL,
	`estimated_days_max` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`carrier_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`carrier_id`) REFERENCES `carrier`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shipping_method_price_nonnegative" CHECK("shipping_method"."price" >= 0),
	CONSTRAINT "shipping_method_free_threshold_nonnegative" CHECK("shipping_method"."free_shipping_threshold" IS NULL OR "shipping_method"."free_shipping_threshold" >= 0),
	CONSTRAINT "shipping_method_days_valid" CHECK("shipping_method"."estimated_days_min" >= 0 AND "shipping_method"."estimated_days_max" >= "shipping_method"."estimated_days_min"),
	CONSTRAINT "shipping_method_sort_nonnegative" CHECK("shipping_method"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_method_name_unique` ON `shipping_method` (`name`);--> statement-breakpoint
CREATE INDEX `shipping_method_active_idx` ON `shipping_method` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `shipping_zone` (
	`id` text PRIMARY KEY NOT NULL,
	`shipping_method_id` text NOT NULL,
	`district` text NOT NULL,
	`price_override` integer NOT NULL,
	`estimated_days_min` integer NOT NULL,
	`estimated_days_max` integer NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	`carrier_id_override` text,
	FOREIGN KEY (`shipping_method_id`) REFERENCES `shipping_method`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`carrier_id_override`) REFERENCES `carrier`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shipping_zone_price_nonnegative" CHECK("shipping_zone"."price_override" >= 0),
	CONSTRAINT "shipping_zone_days_valid" CHECK("shipping_zone"."estimated_days_min" >= 0 AND "shipping_zone"."estimated_days_max" >= "shipping_zone"."estimated_days_min")
);
--> statement-breakpoint
CREATE INDEX `shipping_zone_method_idx` ON `shipping_zone` (`shipping_method_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_zone_lookup_idx` ON `shipping_zone` (`district`,`shipping_method_id`);--> statement-breakpoint
CREATE TABLE `wishlist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `wishlist_user_idx` ON `wishlist_item` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_user_product_variant_idx` ON `wishlist_item` (`user_id`,`product_id`,`variant_id`) WHERE "wishlist_item"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_user_product_no_variant_idx` ON `wishlist_item` (`user_id`,`product_id`) WHERE "wishlist_item"."variant_id" IS NULL;--> statement-breakpoint
CREATE INDEX `wishlist_product_idx` ON `wishlist_item` (`product_id`);--> statement-breakpoint
CREATE TABLE `payment_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bag_id` text NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`checkout_input` text NOT NULL,
	`billing_email` text,
	`provider_order_id` text,
	`provider_response` text,
	`order_id` text,
	`failure_reason` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "payment_attempt_amount_positive" CHECK("payment_attempt"."amount" > 0),
	CONSTRAINT "payment_attempt_checkout_input_valid" CHECK(json_valid("payment_attempt"."checkout_input")),
	CONSTRAINT "payment_attempt_provider_response_valid" CHECK("payment_attempt"."provider_response" IS NULL OR json_valid("payment_attempt"."provider_response"))
);
--> statement-breakpoint
CREATE INDEX `payment_attempt_user_idx` ON `payment_attempt` (`user_id`);--> statement-breakpoint
CREATE INDEX `payment_attempt_bag_idx` ON `payment_attempt` (`bag_id`);--> statement-breakpoint
CREATE INDEX `payment_attempt_provider_order_idx` ON `payment_attempt` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `payment_attempt_status_expiry_idx` ON `payment_attempt` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `payment_webhook_log` (
	`id` text PRIMARY KEY NOT NULL,
	`gateway` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_webhook_log_gateway_idx` ON `payment_webhook_log` (`gateway`);--> statement-breakpoint
CREATE INDEX `payment_webhook_log_created_idx` ON `payment_webhook_log` (`created_at`);