import { getEnv } from '$lib/server/infrastructure/env';
import { baseLayout } from './layout';
import { h } from './escape';
import type { PromotionalEmailInput } from '../types';

export function buildPromotionalEmail(input: PromotionalEmailInput): string {
	const heroHtml = input.heroImageUrl
		? `<img src="${h(input.heroImageUrl)}" alt="" style="width:100%;margin-bottom:24px;display:block;" />`
		: '';
	const bodyHtml = input.body
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.map(
			(paragraph) =>
				`<p style="margin:0 0 16px;font-size:16px;color:#0A0A0A;line-height:1.6;">${h(paragraph)}</p>`
		)
		.join('');

	const content = `
    ${heroHtml}
    <h2 style="margin:0 0 16px;font-family:'Bebas Neue','DM Sans',sans-serif;font-size:38px;font-weight:400;color:#0A0A0A;line-height:1;text-transform:uppercase;letter-spacing:0;">${h(input.headline)}</h2>
    <div style="margin-bottom:32px;">${bodyHtml}</div>
    <a href="${h(input.ctaUrl)}"
       style="display:inline-block;background:#C8FF00;color:#0A0A0A;text-decoration:none;padding:16px 32px;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:0;border:1px solid #0A0A0A;">
      ${h(input.ctaLabel)}
    </a>
    <div style="margin-top:40px;padding-top:24px;border-top:1px solid #0A0A0A;">
      <p style="font-size:12px;color:#0A0A0A;margin:0;opacity:0.6;">
        Sent to those who opted in. 
        <a href="${getEnv().PUBLIC_APP_URL}/account/notifications" style="color:#0A0A0A;text-decoration:underline;">Unsubscribe here.</a>
      </p>
    </div>
  `;

	return baseLayout({
		previewText: input.previewText,
		content,
		footerReason: 'You received this because you opted in to Caro updates.'
	});
}
