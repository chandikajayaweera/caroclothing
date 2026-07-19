UPDATE `payment_attempt` AS `stale`
SET
	`status` = 'cancelled',
	`failure_reason` = 'Superseded while enforcing one active payment attempt per bag.',
	`updated_at` = cast(unixepoch('subsecond') * 1000 as integer)
WHERE
	`stale`.`status` = 'pending'
	AND EXISTS (
		SELECT 1
		FROM `payment_attempt` AS `newer`
		WHERE
			`newer`.`bag_id` = `stale`.`bag_id`
			AND `newer`.`status` = 'pending'
			AND (
				`newer`.`created_at` > `stale`.`created_at`
				OR (
					`newer`.`created_at` = `stale`.`created_at`
					AND `newer`.`id` > `stale`.`id`
				)
			)
	);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempt_one_pending_per_bag_idx` ON `payment_attempt` (`bag_id`) WHERE "payment_attempt"."status" = 'pending';
