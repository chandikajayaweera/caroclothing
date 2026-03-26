import { env } from '$lib/server/modules/env';
import { baseLayout } from './layout';
import type { OTPType } from '../types';

interface OTPTemplateResult {
	subject: string;
	html: string;
}

const OTP_COPY: Record<OTPType, { subject: string; action: string; note: string }> = {
	'sign-in': {
		subject: `Your ${env.APP_NAME} sign-in code`,
		action: 'sign in to your account',
		note: "If you didn't try to sign in, someone may be attempting to access your account. You can safely ignore this email."
	},
	'email-verification': {
		subject: `Verify your email – ${env.APP_NAME}`,
		action: 'verify your email address',
		note: "If you didn't create an account, you can safely ignore this email."
	},
	'forget-password': {
		subject: `Reset your password – ${env.APP_NAME}`,
		action: 'reset your password',
		note: "If you didn't request a password reset, you can safely ignore this email."
	},
	'change-email': {
		subject: `Confirm your new email – ${env.APP_NAME}`,
		action: 'confirm your new email address',
		note: "If you didn't request an email change, please secure your account immediately."
	}
};

export function buildOTPEmail(otp: string, type: OTPType): OTPTemplateResult {
	const copy = OTP_COPY[type];

	const content = `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;">Use the code below to ${copy.action}:</p>

    <div style="background:#f4f4f5;border-radius:10px;padding:24px;text-align:center;margin:20px 0;">
      <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#111827;font-variant-numeric:tabular-nums;">
        ${otp}
      </span>
    </div>

    <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">
      This code expires in <strong>10 minutes</strong>.
    </p>
    <p style="margin:0;font-size:13px;color:#9CA3AF;">${copy.note}</p>
  `;

	return {
		subject: copy.subject,
		html: baseLayout({ previewText: `Your one-time code is ${otp}`, content })
	};
}
