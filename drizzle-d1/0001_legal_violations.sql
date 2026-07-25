CREATE TABLE `_d1_batch_guard` (
	`nonce` text PRIMARY KEY NOT NULL,
	`passed` integer NOT NULL,
	CONSTRAINT "d1_batch_guard_passed" CHECK("_d1_batch_guard"."passed" = 1)
);
