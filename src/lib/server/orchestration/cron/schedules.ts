export const CLOUDFLARE_CRON_TRIGGER = '* * * * *' as const;

export const CRON_SCHEDULES = {
	notifications: '*/5 * * * *',
	orderPaymentExpiry: '*/10 * * * *',
	bagCheckoutExpiry: '* * * * *',
	bagCleanup: '0 * * * *',
	promoReconcile: '17 20 * * *'
} as const;

export type CronSchedule = (typeof CRON_SCHEDULES)[keyof typeof CRON_SCHEDULES];

// Cloudflare account limits apply across every Worker. A single per-minute
// trigger per environment feeds the runtime-neutral cadence registry below.
export const CONFIGURED_CRON_SCHEDULES = [CLOUDFLARE_CRON_TRIGGER] as const;
