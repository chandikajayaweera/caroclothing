import { getEnv } from '$lib/server/modules/env';
import { baseLayout } from './layout';
import { h } from './escape';

interface WelcomeTemplateResult {
	subject: string;
	html: string;
}

export function buildWelcomeEmail(name: string): WelcomeTemplateResult {
	const safeName = h(name);

	const content = `
    <h2 style="margin:0 0 16px;font-family:'Bebas Neue','DM Sans',sans-serif;font-size:34px;font-weight:400;color:#0A0A0A;text-transform:uppercase;letter-spacing:0;line-height:1;">
      Welcome to Caro, ${safeName}.
    </h2>
    <p style="margin:0 0 32px;font-size:16px;color:#0A0A0A;line-height:1.6;">
      Streetwear made here. Drops move fast. Core stays ready.
    </p>
    <a href="${getEnv().PUBLIC_APP_URL}/shop"
       style="display:inline-block;background:#C8FF00;color:#0A0A0A;text-decoration:none;padding:16px 32px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:0;border:1px solid #0A0A0A;">
      Shop All
    </a>
    <p style="margin:40px 0 0;font-size:13px;color:#0A0A0A;opacity:0.6;font-family:'Space Mono',monospace;text-transform:uppercase;">
      Questions? Reply here.
    </p>
  `;

	return {
		subject: `Welcome to ${getEnv().PUBLIC_APP_NAME}`,
		html: baseLayout({
			previewText: `Welcome to ${getEnv().PUBLIC_APP_NAME}. Drops and core are ready.`,
			content
		})
	};
}
