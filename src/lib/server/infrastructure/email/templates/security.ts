import { getEnv } from '$lib/server/infrastructure/env';
import { baseLayout } from './layout';
import { h } from './escape';
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

export function buildSecurityEmail(input: SecurityTemplateInput): SecurityTemplateResult {
	const EVENT_COPY: Record<
		SecurityEventType,
		{ subject: string; headline: string; body: string; action: string }
	> = {
		new_login: {
			subject: `Security: New sign-in detected`,
			headline: 'New sign-in detected',
			body: 'A new device signed in to your account.',
			action: "If this wasn't you, secure your account immediately."
		},
		password_changed: {
			subject: `Security: Password changed`,
			headline: 'Password changed',
			body: 'Your account password was changed.',
			action: "If you didn't make this change, secure your account immediately."
		},
		email_changed: {
			subject: `Security: Email updated`,
			headline: 'Email updated',
			body: 'The email address on your account was changed.',
			action: "If you didn't make this change, secure your account immediately."
		},
		account_linked: {
			subject: `Security: Account linked`,
			headline: 'Account linked',
			body: 'A new sign-in method was linked to your account.',
			action: "If you didn't link it, secure your account immediately."
		}
	};

	const copy = EVENT_COPY[input.event];

	const detailsHtml =
		input.deviceInfo || input.ipAddress
			? `
        <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:13px;color:#0A0A0A;font-family:'Space Mono',monospace;text-transform:uppercase;">
          ${input.deviceInfo ? `<tr><td style="padding:8px 0;opacity:0.6;width:120px;">Device</td><td style="padding:8px 0;">${h(input.deviceInfo)}</td></tr>` : ''}
          ${input.ipAddress ? `<tr><td style="padding:8px 0;opacity:0.6;">IP Address</td><td style="padding:8px 0;">${h(input.ipAddress)}</td></tr>` : ''}
        </table>
      `
			: '';

	const content = `
    <h2 style="margin:0 0 16px;font-family:'Bebas Neue','DM Sans',sans-serif;font-size:32px;font-weight:400;color:#0A0A0A;text-transform:uppercase;letter-spacing:0;line-height:1;">${copy.headline}</h2>
    <p style="margin:0 0 8px;font-size:16px;color:#0A0A0A;line-height:1.5;">${copy.body}</p>
    ${detailsHtml}
    
    <div style="background:#0A0A0A;padding:24px;margin-top:32px;border:1px solid #0A0A0A;">
      <p style="margin:0 0 16px;font-size:14px;color:#F8F5F0;font-weight:500;">
		${copy.action}
      </p>
      <a href="${getEnv().PUBLIC_APP_URL}/account/security" 
         style="display:inline-block;background:#C8FF00;color:#0A0A0A;text-decoration:none;padding:12px 24px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:0;">
        Secure Account
      </a>
    </div>
  `;

	return {
		subject: copy.subject,
		html: baseLayout({ previewText: copy.headline, content })
	};
}
