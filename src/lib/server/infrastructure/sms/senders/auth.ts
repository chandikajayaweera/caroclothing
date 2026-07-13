import { sendSms } from '../client';
import type { SmsResult } from '../types';

/**
 * Sends a phone OTP code via SMS. Called by the better-auth phoneNumber plugin's sendOTP hook.
 */
export async function sendOtpSms(phoneNumber: string, code: string): Promise<SmsResult> {
	return sendSms({
		to: phoneNumber,
		senderPurpose: 'otp',
		message: `Code ${code}. Valid 10 min. Do not share.`
	});
}
