import { env } from '$lib/server/modules/env';
import { baseLayout } from './layout';
import type { PromotionalEmailInput } from '../types';

export function buildPromotionalEmail(input: PromotionalEmailInput): string {
	const heroHtml = input.heroImageUrl
		? `<img src="${input.heroImageUrl}" alt="" style="width:100%;border-radius:8px;margin-bottom:20px;display:block;" />`
		: '';

	const content = `
    ${heroHtml}
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#111827;line-height:1.2;">${input.headline}</h2>
    <div style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:24px;">${input.body}</div>
    <a href="${input.ctaUrl}"
       style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:700;">
      ${input.ctaLabel}
    </a>
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:28px 0 12px;" />
    <p style="font-size:12px;color:#9CA3AF;margin:0;">
      You're receiving this because you opted in to marketing emails from ${env.APP_NAME}.
      <a href="${env.APP_URL}/account/notifications" style="color:#9CA3AF;">Unsubscribe</a>
    </p>
  `;

	return baseLayout({ previewText: input.previewText, content });
}
