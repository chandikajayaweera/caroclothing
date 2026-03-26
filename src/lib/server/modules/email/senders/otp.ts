// senders/otp.ts
import { z } from 'zod';
import { buildOTPEmail } from '../templates/otp';
import { sendEmail } from '../client';

const OTPInputSchema = z.object({
	email: z.email(),
	otp: z.string().min(1).max(255),
	type: z.enum(['sign-in', 'email-verification', 'forget-password', 'change-email'])
});

export async function sendEmailVerificationOTP(input: unknown): Promise<void> {
	const parsed = OTPInputSchema.parse(input); // throws ZodError on bad input

	const { subject, html } = buildOTPEmail(parsed.otp, parsed.type);

	const result = await sendEmail({
		to: parsed.email,
		subject,
		html,
		tags: [{ name: 'category', value: 'otp' }]
	});

	if (!result.ok) {
		throw new Error(`[email/otp] Failed to send OTP: ${result.error}`);
	}
}
