import { getClientEnv } from '$lib/client/modules/env';
import { baseLayout } from './layout';
import type { PromotionalEmailInput } from '../types';

export function buildPromotionalEmail(input: PromotionalEmailInput): string {
	const clientEnv = getClientEnv();
	const heroHtml = input.heroImageUrl
		? `<img src="${input.heroImageUrl}" alt="" style="width:100%;margin-bottom:24px;display:block;" />`
		: '';

	const content = `
    ${heroHtml}
    <h2 style="margin:0 0 16px;font-size:32px;font-weight:900;color:#0A0A0A;line-height:1.1;text-transform:uppercase;letter-spacing:-1px;">${input.headline}</h2>
    <div style="font-size:16px;color:#0A0A0A;line-height:1.6;margin-bottom:32px;">${input.body}</div>
    <a href="${input.ctaUrl}"
       style="display:inline-block;background:#C8FF00;color:#0A0A0A;text-decoration:none;padding:16px 32px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;border:1px solid #0A0A0A;">
      ${input.ctaLabel}
    </a>
    <div style="margin-top:40px;padding-top:24px;border-top:1px solid #0A0A0A;">
      <p style="font-size:12px;color:#0A0A0A;margin:0;opacity:0.6;">
        Sent to those who opted in. 
        <a href="${clientEnv.PUBLIC_APP_URL}/account/notifications" style="color:#0A0A0A;text-decoration:underline;">Unsubscribe here.</a>
      </p>
    </div>
  `;

	return baseLayout({ previewText: input.previewText, content });
}
