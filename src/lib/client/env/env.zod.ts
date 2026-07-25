import { z } from 'zod';

const optionalPublicCredential = z.preprocess(
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	z.string().min(1).optional()
);

export const clientEnvSchema = z.object({
	PUBLIC_APP_NAME: z.string().min(1, 'PUBLIC_APP_NAME is required'),
	PUBLIC_APP_URL: z.url('PUBLIC_APP_URL must be a valid URL'),
	PUBLIC_SENTRY_DSN: z
		.union([z.url('PUBLIC_SENTRY_DSN must be a valid URL'), z.literal('')])
		.default(''),
	PUBLIC_SENTRY_ENVIRONMENT: z.string().optional().default('development'),
	PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional().default(0.1),
	PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: z.coerce
		.number()
		.min(0)
		.max(1)
		.optional()
		.default(0.05),
	PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional().default(1),
	PUBLIC_GOOGLE_CLIENT_ID: optionalPublicCredential,
	PUBLIC_OTP_COOLDOWN_SECONDS: z.coerce
		.number()
		.min(1, 'OTP_COOLDOWN_SECONDS must be at least 1 second')
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
