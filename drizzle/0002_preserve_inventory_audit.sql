PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inventory_movement` (
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
	FOREIGN KEY (`variant_id`) REFERENCES `product_variant`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inv_movement_delta_nonzero" CHECK("__new_inventory_movement"."quantity_delta" <> 0 OR "__new_inventory_movement"."reserved_quantity_delta" <> 0),
	CONSTRAINT "inv_movement_quantity_after_nonnegative" CHECK("__new_inventory_movement"."quantity_after" >= 0),
	CONSTRAINT "inv_movement_reserved_after_nonnegative" CHECK("__new_inventory_movement"."reserved_quantity_after" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_inventory_movement`("id", "variant_id", "type", "quantity_delta", "quantity_after", "reserved_quantity_delta", "reserved_quantity_after", "reference_id", "note", "created_at") SELECT "id", "variant_id", "type", "quantity_delta", "quantity_after", "reserved_quantity_delta", "reserved_quantity_after", "reference_id", "note", "created_at" FROM `inventory_movement`;--> statement-breakpoint
DROP TABLE `inventory_movement`;--> statement-breakpoint
ALTER TABLE `__new_inventory_movement` RENAME TO `inventory_movement`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `inv_movement_variant_idx` ON `inventory_movement` (`variant_id`);--> statement-breakpoint
CREATE INDEX `inv_movement_type_idx` ON `inventory_movement` (`type`);--> statement-breakpoint
CREATE INDEX `inv_movement_ref_idx` ON `inventory_movement` (`reference_id`);--> statement-breakpoint
CREATE INDEX `inv_movement_created_idx` ON `inventory_movement` (`created_at`);