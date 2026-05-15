import { getEnv } from '$lib/server/modules/env';
import { sendSms } from '../client';
import type { DropLaunchSmsInput, SmsResult } from '../types';

export async function sendDropLaunchSms(input: DropLaunchSmsInput): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		message: `${getEnv().PUBLIC_APP_NAME}: ${input.dropName} is live. Shop: ${input.dropUrl}`
	});
}
