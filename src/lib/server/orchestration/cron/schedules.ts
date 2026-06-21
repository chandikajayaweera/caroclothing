export const CRON_SCHEDULES = {
	dropLaunchAndNotifications: '*/5 * * * *',
	orderPaymentExpiry: '*/10 * * * *',
	bagCheckoutExpiry: '* * * * *',
	bagCleanup: '0 * * * *',
	promoReconcile: '17 20 * * *'
} as const;

export type CronSchedule = (typeof CRON_SCHEDULES)[keyof typeof CRON_SCHEDULES];
