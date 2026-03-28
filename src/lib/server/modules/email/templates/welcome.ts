import { getEnv } from '$lib/server/modules/env';
import { baseLayout } from './layout';
import { h } from './escape';

interface WelcomeTemplateResult {
	subject: string;
	html: string;
}

export function buildWelcomeEmail(name: string): WelcomeTemplateResult {
	const env = getEnv();
	const safeName = h(name);

	const content = `
    <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">
      Welcome to ${env.APP_NAME}, ${safeName}!
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      We're thrilled to have you. Explore our latest collections and find pieces that feel like you.
    </p>
    <a href="${env.APP_URL}/shop"
       style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Start Shopping
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;">
      If you have any questions, reply to this email — we're happy to help.
    </p>
  `;

	return {
		subject: `Welcome to ${env.APP_NAME} 🎉`,
		html: baseLayout({ previewText: `Welcome to ${env.APP_NAME}, ${safeName}!`, content })
	};
}
