import { getClientEnv } from '$lib/client/modules/env';
import { baseLayout } from './layout';
import { h } from './escape';

interface WelcomeTemplateResult {
	subject: string;
	html: string;
}

export function buildWelcomeEmail(name: string): WelcomeTemplateResult {
	const clientEnv = getClientEnv();
	const safeName = h(name);

	const content = `
    <h2 style="margin:0 0 16px;font-size:28px;font-weight:900;color:#0A0A0A;text-transform:uppercase;letter-spacing:-1px;">
      Welcome to Caro, ${safeName}.
    </h2>
    <p style="margin:0 0 32px;font-size:16px;color:#0A0A0A;line-height:1.6;">
      The next generation of streetwear is here. Explore the latest drops and core essentials.
    </p>
    <a href="${clientEnv.PUBLIC_APP_URL}/shop"
       style="display:inline-block;background:#C8FF00;color:#0A0A0A;text-decoration:none;padding:16px 32px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;border:1px solid #0A0A0A;">
      Shop All
    </a>
    <p style="margin:40px 0 0;font-size:13px;color:#0A0A0A;opacity:0.6;font-family:'Space Mono',monospace;text-transform:uppercase;">
      Questions? Reply here.
    </p>
  `;

	return {
		subject: `Welcome to ${clientEnv.PUBLIC_APP_NAME}`,
		html: baseLayout({
			previewText: `Welcome to ${clientEnv.PUBLIC_APP_NAME}. Explore the next generation.`,
			content
		})
	};
}
