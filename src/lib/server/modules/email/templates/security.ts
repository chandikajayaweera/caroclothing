import { env } from '$lib/server/modules/env';
import { baseLayout } from './layout';
import type { SecurityEventType } from '../types';

interface SecurityTemplateResult {
	subject: string;
	html: string;
}

interface SecurityTemplateInput {
	event: SecurityEventType;
	deviceInfo?: string;
	ipAddress?: string;
}

const EVENT_COPY: Record<SecurityEventType, { subject: string; headline: string; body: string }> = {
	new_login: {
		subject: `New sign-in to your ${env.APP_NAME} account`,
		headline: 'New sign-in detected',
		body: 'We noticed a new sign-in to your account. If this was you, no action is needed.'
	},
	password_changed: {
		subject: `Your ${env.APP_NAME} password was changed`,
		headline: 'Password changed',
		body: 'Your account password was successfully changed.'
	},
	email_changed: {
		subject: `Your ${env.APP_NAME} email address was updated`,
		headline: 'Email address updated',
		body: 'The email address on your account has been changed.'
	},
	account_linked: {
		subject: `Account linked – ${env.APP_NAME}`,
		headline: 'Account linked',
		body: 'A sign-in method has been linked to your account.'
	}
};

export function buildSecurityEmail(input: SecurityTemplateInput): SecurityTemplateResult {
	const copy = EVENT_COPY[input.event];

	const detailsHtml =
		input.deviceInfo || input.ipAddress
			? `
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;color:#374151;">
          ${input.deviceInfo ? `<tr><td style="padding:6px 0;color:#6B7280;width:110px;">Device</td><td>${input.deviceInfo}</td></tr>` : ''}
          ${input.ipAddress ? `<tr><td style="padding:6px 0;color:#6B7280;">IP Address</td><td>${input.ipAddress}</td></tr>` : ''}
        </table>
      `
			: '';

	const content = `
    <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111827;">${copy.headline}</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#374151;">${copy.body}</p>
    ${detailsHtml}
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px;margin-top:16px;">
      <p style="margin:0;font-size:13px;color:#B91C1C;font-weight:500;">
        If this wasn't you, please
        <a href="${env.APP_URL}/account/security" style="color:#B91C1C;text-decoration:underline;">secure your account</a>
        immediately or contact our support team.
      </p>
    </div>
  `;

	return {
		subject: copy.subject,
		html: baseLayout({ previewText: copy.headline, content })
	};
}
