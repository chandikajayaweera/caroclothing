import { runScheduledJobs } from '$lib/server/orchestration/cron';
import { createCloudflareNotificationWakeupPublisher } from './notification-wakeups';

export function runCloudflareScheduledJobs(
	controller: ScheduledController,
	env: App.Platform['env'],
	ctx: ExecutionContext
) {
	void ctx;

	return runScheduledJobs({
		cron: controller.cron,
		scheduledTime: controller.scheduledTime,
		notificationWakeups: createCloudflareNotificationWakeupPublisher(env.NOTIFICATION_QUEUE)
	});
}
