import { getClientEnv } from '$lib/client/modules/env';
import { baseLayout } from './layout';
import type { OTPType } from '../types';

interface OTPTemplateResult {
	subject: string;
	html: string;
}

export function buildOTPEmail(otp: string, type: OTPType): OTPTemplateResult {
	const clientEnv = getClientEnv();

	const OTP_COPY: Record<OTPType, { subject: string; action: string; note: string }> = {
		'sign-in': {
			subject: `${clientEnv.PUBLIC_APP_NAME}: Sign-in code`,
			action: 'sign in',
			note: "If you didn't try to sign in, ignore this email."
		},
		'email-verification': {
			subject: `Verify your email – ${clientEnv.PUBLIC_APP_NAME}`,
			action: 'verify your email',
			note: "If you didn't create an account, ignore this email."
		},
		'forget-password': {
			subject: `Reset password – ${clientEnv.PUBLIC_APP_NAME}`,
			action: 'reset your password',
			note: "If you didn't request a reset, ignore this email."
		},
		'change-email': {
			subject: `Confirm new email – ${clientEnv.PUBLIC_APP_NAME}`,
			action: 'confirm your new email',
			note: "If you didn't request this, secure your account."
		}
	};

	const copy = OTP_COPY[type];

	const content = `
    <p style="margin:0 0 16px;font-size:16px;color:#0A0A0A;font-weight:500;">Use this code to ${copy.action}:</p>

    <div style="background:#0A0A0A;padding:32px;text-align:center;margin:24px 0;border:1px solid #0A0A0A;">
      <span style="font-family:'Space Mono',monospace;font-size:48px;font-weight:700;letter-spacing:8px;color:#C8FF00;font-variant-numeric:tabular-nums;">
        ${otp}
      </span>
    </div>

    <p style="margin:0 0 8px;font-size:14px;color:#0A0A0A;font-family:'Space Mono',monospace;text-transform:uppercase;">
      Expires in 10 minutes.
    </p>
    <p style="margin:0;font-size:13px;color:#0A0A0A;opacity:0.6;">${copy.note}</p>
  `;

	return {
		subject: copy.subject,
		html: baseLayout({ previewText: `Your code: ${otp}`, content })
	};
}
