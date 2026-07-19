PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_wishlist_item` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`variant_id` text,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_wishlist_item`("id", "user_id", "product_id", "variant_id", "added_at") SELECT "id", "user_id", "product_id", "variant_id", "added_at" FROM `wishlist_item`;--> statement-breakpoint
DROP TABLE `wishlist_item`;--> statement-breakpoint
ALTER TABLE `__new_wishlist_item` RENAME TO `wishlist_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `wishlist_user_idx` ON `wishlist_item` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_user_product_variant_idx` ON `wishlist_item` (`user_id`,`product_id`,`variant_id`) WHERE "wishlist_item"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_user_product_no_variant_idx` ON `wishlist_item` (`user_id`,`product_id`) WHERE "wishlist_item"."variant_id" IS NULL;--> statement-breakpoint
CREATE INDEX `wishlist_product_idx` ON `wishlist_item` (`product_id`);