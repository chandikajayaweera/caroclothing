import { sendSms } from '../client';
import type { SmsResult } from '../types';
import { getEnv } from '$lib/server/modules/env';

/**
 * Sends a phone OTP code via SMS. Called by the better-auth phoneNumber plugin's sendOTP hook.
 */
export async function sendOtpSms(phoneNumber: string, code: string): Promise<SmsResult> {
	return sendSms({
		to: phoneNumber,
		message: `${getEnv().PUBLIC_APP_NAME} code: ${code}\nValid for 10 minutes. Do not share.`
	});
}
