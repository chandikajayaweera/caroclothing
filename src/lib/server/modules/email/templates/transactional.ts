import { env } from '$lib/server/modules/env';
import { baseLayout } from './layout';
import type { OrderConfirmationInput, ShippingUpdateInput } from '../types';
import { h } from './escape';

// ── Order Confirmation ─────────────────────────────────────────────────────────

export function buildOrderConfirmationEmail(input: OrderConfirmationInput): {
	subject: string;
	html: string;
} {
	const itemRows = input.items
		.map(
			(item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">
          ${h(item.name)} <span style="color:#9CA3AF;">× ${item.quantity}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;text-align:right;white-space:nowrap;">
          ${h(item.price)}
        </td>
      </tr>
    `
		)
		.join('');

	const content = `
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">Order confirmed 🎉</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;">Hi ${h(input.customerName)}, thank you for your purchase!</p>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;">Order</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">#${h(input.orderId)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6B7280;">${input.orderDate}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${itemRows}
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6B7280;">Subtotal</td>
        <td style="padding:8px 0;font-size:13px;color:#374151;text-align:right;">${input.subtotal}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#6B7280;">Shipping</td>
        <td style="padding:8px 0;font-size:13px;color:#374151;text-align:right;">${input.shipping}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #111827;">Total</td>
        <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#111827;text-align:right;border-top:2px solid #111827;">${input.total}</td>
      </tr>
    </table>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;">Shipping to</p>
      <p style="margin:0;font-size:14px;color:#374151;">${h(input.shippingAddress)}</p>
      ${input.estimatedDelivery ? `<p style="margin:4px 0 0;font-size:13px;color:#6B7280;">Est. delivery: ${h(input.estimatedDelivery)}</p>` : ''}
    </div>

    <a href="${env.APP_URL}/orders/${h(input.orderId)}"
       style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
      View order
    </a>
  `;

	return {
		subject: `Order confirmed – #${input.orderId}`,
		html: baseLayout({ previewText: `Your order #${input.orderId} is confirmed`, content })
	};
}

// ── Shipping Update ────────────────────────────────────────────────────────────

export function buildShippingUpdateEmail(input: ShippingUpdateInput): {
	subject: string;
	html: string;
} {
	const content = `
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827;">Your order is on its way 📦</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#6B7280;">Hi ${h(input.customerName)}, your order has been shipped!</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Tracking number</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#166534;letter-spacing:1px;">${h(input.trackingNumber)}</p>
      ${input.carrier ? `<p style="margin:4px 0 0;font-size:13px;color:#166534;">via ${h(input.carrier)}</p>` : ''}
    </div>

    ${input.estimatedDelivery ? `<p style="font-size:14px;color:#374151;margin:0 0 16px;">Estimated delivery: <strong>${h(input.estimatedDelivery)}</strong></p>` : ''}

    <div>
  ${
		input.trackingUrl
			? `<a href="${input.trackingUrl}"
         style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-right:12px;margin-bottom:8px;">
         Track shipment
       </a>`
			: ''
	}
  <a href="${env.APP_URL}/orders/${h(input.orderId)}"
     style="display:inline-block;background:#f3f4f6;color:#111827;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:8px;">
    View order
  </a>
</div>
  `;

	return {
		subject: `Your order #${input.orderId} has shipped`,
		html: baseLayout({ previewText: `Tracking: ${input.trackingNumber}`, content })
	};
}
