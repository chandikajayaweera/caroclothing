import type { NotificationQueueBatchResult } from '$lib/server/modules/notifications/outbox/outbox.types';

export type QueueProcessorName = 'notifications' | 'unsupported';

export type QueueBatchResult =
	| {
			queue: string;
			processor: 'notifications';
			processedCount: number;
			result: NotificationQueueBatchResult;
	  }
	| {
			queue: string;
			processor: 'unsupported';
			processedCount: 0;
			message: string;
	  };
