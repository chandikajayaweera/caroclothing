export const CRON_SCHEDULES = {
	notifications: '*/5 * * * *',
	orderPaymentExpiry: '*/10 * * * *',
	bagCheckoutExpiry: '* * * * *',
	bagCleanup: '0 * * * *',
	promoReconcile: '17 20 * * *'
} as const;

export type CronSchedule = (typeof CRON_SCHEDULES)[keyof typeof CRON_SCHEDULES];

export const CONFIGURED_CRON_SCHEDULES = [
	CRON_SCHEDULES.bagCheckoutExpiry,
	CRON_SCHEDULES.notifications,
	CRON_SCHEDULES.orderPaymentExpiry,
	CRON_SCHEDULES.bagCleanup,
	CRON_SCHEDULES.promoReconcile
] as const satisfies readonly CronSchedule[];
