import { getEnv } from '$lib/server/infrastructure/env';
import { sendSms } from '../client';
import type { DropLaunchSmsInput, SmsResult } from '../types';

export async function sendDropLaunchSms(input: DropLaunchSmsInput): Promise<SmsResult> {
	return sendSms({
		to: input.to,
		senderPurpose: 'promotional',
		message: `${getEnv().PUBLIC_APP_NAME}: ${input.dropName} is live. Shop: ${input.dropUrl}`
	});
}
