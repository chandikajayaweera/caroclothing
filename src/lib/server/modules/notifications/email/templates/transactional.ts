import { getClientEnv } from '$lib/client/modules/env';
import { baseLayout } from './layout';
import type { OrderConfirmationInput, ShippingUpdateInput } from '../types';
import { h } from './escape';

// ── Order Confirmation ─────────────────────────────────────────────────────────

export function buildOrderConfirmationEmail(input: OrderConfirmationInput): {
	subject: string;
	html: string;
} {
	const clientEnv = getClientEnv();
	const itemRows = input.items
		.map(
			(item) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #0A0A0A;font-size:14px;color:#0A0A0A;">
          ${h(item.name)} <span style="font-family:'Space Mono',monospace;opacity:0.6;">× ${item.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #0A0A0A;font-size:14px;font-family:'Space Mono',monospace;color:#0A0A0A;text-align:right;white-space:nowrap;">
          ${h(item.price)}
        </td>
      </tr>
    `
		)
		.join('');

	const content = `
    <h2 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#0A0A0A;text-transform:uppercase;">Order Confirmed</h2>
    <p style="margin:0 0 32px;font-size:16px;color:#0A0A0A;">Hi ${h(input.customerName)}, thanks for the support.</p>

    <div style="background:#0A0A0A;padding:24px;margin-bottom:32px;color:#F8F5F0;font-family:'Space Mono',monospace;text-transform:uppercase;">
      <p style="margin:0 0 4px;font-size:10px;opacity:0.6;letter-spacing:1px;">Order ID</p>
      <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:1px;">#${h(input.orderId)}</p>
      <p style="margin:8px 0 0;font-size:12px;opacity:0.8;">${input.orderDate}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-collapse:collapse;">
      ${itemRows}
      <tr>
        <td style="padding:12px 0;font-family:'Space Mono',monospace;font-size:12px;text-transform:uppercase;opacity:0.6;">Subtotal</td>
        <td style="padding:12px 0;font-family:'Space Mono',monospace;font-size:12px;color:#0A0A0A;text-align:right;">${input.subtotal}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;font-family:'Space Mono',monospace;font-size:12px;text-transform:uppercase;opacity:0.6;">Shipping</td>
        <td style="padding:12px 0;font-family:'Space Mono',monospace;font-size:12px;color:#0A0A0A;text-align:right;">${input.shipping}</td>
      </tr>
      <tr>
        <td style="padding:16px 0 0;font-size:16px;font-weight:900;color:#0A0A0A;text-transform:uppercase;border-top:2px solid #0A0A0A;">Total</td>
        <td style="padding:16px 0 0;font-size:16px;font-weight:900;color:#0A0A0A;text-align:right;border-top:2px solid #0A0A0A;font-family:'Space Mono',monospace;">${input.total}</td>
      </tr>
    </table>

    <div style="border:1px solid #0A0A0A;padding:24px;margin-bottom:32px;">
      <p style="margin:0 0 8px;font-family:'Space Mono',monospace;font-size:10px;text-transform:uppercase;opacity:0.6;letter-spacing:1px;">Shipping Address</p>
      <p style="margin:0;font-size:14px;color:#0A0A0A;line-height:1.5;">${h(input.shippingAddress)}</p>
      ${input.estimatedDelivery ? `<p style="margin:12px 0 0;font-family:'Space Mono',monospace;font-size:12px;color:#0A0A0A;text-transform:uppercase;">Est: ${h(input.estimatedDelivery)}</p>` : ''}
    </div>

    <a href="${clientEnv.PUBLIC_APP_URL}/orders/${h(input.orderId)}"
       style="display:inline-block;background:#C8FF00;color:#0A0A0A;text-decoration:none;padding:14px 28px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;border:1px solid #0A0A0A;">
      View Order
    </a>
  `;

	return {
		subject: `Order #${input.orderId} Confirmed`,
		html: baseLayout({ previewText: `Support confirmed. Order #${input.orderId}`, content })
	};
}

// ── Shipping Update ────────────────────────────────────────────────────────────

export function buildShippingUpdateEmail(input: ShippingUpdateInput): {
	subject: string;
	html: string;
} {
	const clientEnv = getClientEnv();
	const content = `
    <h2 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#0A0A0A;text-transform:uppercase;">On Its Way</h2>
    <p style="margin:0 0 32px;font-size:16px;color:#0A0A0A;">Hi ${h(input.customerName)}, your order has been shipped.</p>

    <div style="background:#C8FF00;padding:24px;margin-bottom:32px;border:1px solid #0A0A0A;">
      <p style="margin:0 0 4px;font-family:'Space Mono',monospace;font-size:10px;color:#0A0A0A;text-transform:uppercase;opacity:0.6;letter-spacing:1px;">Tracking Number</p>
      <p style="margin:0;font-family:'Space Mono',monospace;font-size:20px;font-weight:700;color:#0A0A0A;letter-spacing:1px;">${h(input.trackingNumber)}</p>
      ${input.carrier ? `<p style="margin:8px 0 0;font-family:'Space Mono',monospace;font-size:12px;color:#0A0A0A;text-transform:uppercase;">via ${h(input.carrier)}</p>` : ''}
    </div>

    ${input.estimatedDelivery ? `<p style="font-family:'Space Mono',monospace;font-size:14px;color:#0A0A0A;margin:0 0 32px;text-transform:uppercase;">Estimated Delivery: <strong>${h(input.estimatedDelivery)}</strong></p>` : ''}

    <div style="margin-top:32px;">
  ${
		input.trackingUrl
			? `<a href="${input.trackingUrl}"
         style="display:inline-block;background:#C8FF00;color:#0A0A0A;text-decoration:none;padding:14px 28px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;border:1px solid #0A0A0A;margin-right:12px;margin-bottom:12px;">
         Track Shipment
       </a>`
			: ''
	}
  <a href="${clientEnv.PUBLIC_APP_URL}/orders/${h(input.orderId)}"
     style="display:inline-block;background:#0A0A0A;color:#F8F5F0;text-decoration:none;padding:14px 28px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
    View Order
  </a>
</div>
  `;

	return {
		subject: `Order #${input.orderId} Shipped`,
		html: baseLayout({ previewText: `Tracking: ${input.trackingNumber}`, content })
	};
}
