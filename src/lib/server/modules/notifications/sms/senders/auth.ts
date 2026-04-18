import { sendSms } from '../client';
import type { SmsResult } from '../types';
import { getClientEnv } from '$lib/client/modules/env';

/**
 * Sends a phone OTP code via SMS. Called by the better-auth phoneNumber plugin's sendOTP hook.
 */
export async function sendOtpSms(phoneNumber: string, code: string): Promise<SmsResult> {
	const clientEnv = getClientEnv();
	return sendSms({
		to: phoneNumber,
		message: `Your ${clientEnv.PUBLIC_APP_NAME} verification code is: ${code}\n\nValid for 10 minutes. Do not share this code with anyone.`
	});
}
