import { z } from 'zod';

export const clientEnvSchema = z.object({
	PUBLIC_APP_NAME: z.string().min(1, 'PUBLIC_APP_NAME is required'),
	PUBLIC_APP_URL: z.url('PUBLIC_APP_URL must be a valid URL'),
	PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1, 'PUBLIC_GOOGLE_CLIENT_ID is required'),
	PUBLIC_OTP_COOLDOWN_SECONDS: z.coerce
		.number()
		.min(1, 'OTP_COOLDOWN_SECONDS must be at least 1 second')
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
