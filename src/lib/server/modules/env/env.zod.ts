import { z } from 'zod';

export const envSchema = z.object({
	// Database
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	DATABASE_AUTH_TOKEN: z.string().optional(),

	// Auth
	BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),

	// Google OAuth
	GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),

	// Email
	RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
	EMAIL_FROM_ADDRESS: z.email('EMAIL_FROM_ADDRESS must be a valid email'),

	// SMS
	TEXT_LK_API_KEY: z.string().min(1, 'TEXT_LK_API_KEY is required'),
	TEXT_LK_SENDER_ID: z.string().min(1, 'TEXT_LK_SENDER_ID is required')
});

export type Env = z.infer<typeof envSchema>;
