import {
	sendDropLaunchEmail,
	sendGoogleLinkedEmail,
	sendOrderConfirmationEmail,
	sendShippingUpdateEmail,
	sendWelcomeEmail
} from '$lib/server/infrastructure/email';
import type {
	GoogleLinkedEmailInput,
	OrderConfirmationInput,
	ShippingUpdateInput,
	WelcomeEmailInput
} from '$lib/server/infrastructure/email';
import {
	sendDropLaunchSms,
	sendOrderConfirmationSms,
	sendOrderStatusUpdateSms,
	sendPaymentUpdateSms,
	sendShippingUpdateSms
} from '$lib/server/infrastructure/sms';
import type {
	OrderConfirmationSmsInput,
	OrderStatusUpdateSmsInput,
	PaymentUpdateSmsInput,
	ShippingUpdateSmsInput
} from '$lib/server/infrastructure/sms';
import type {
	ClaimedNotificationDTO,
	DropLaunchOutboxEmailInput,
	DropLaunchOutboxSmsInput
} from '$lib/server/modules/notifications/outbox/outbox.types';
import type {
	NotificationChannel,
	NotificationOutboxType
} from '$lib/server/modules/notifications/outbox/outbox.drizzle';
import {
	toEmailDispatchResult,
	toSmsDispatchResult,
	type ProviderDispatchResult
} from './results';

type NotificationDispatchHandler = (
	notification: ClaimedNotificationDTO
) => Promise<ProviderDispatchResult>;

const notificationDispatchers: Partial<
	Record<NotificationOutboxType, Partial<Record<NotificationChannel, NotificationDispatchHandler>>>
> = {
	auth_welcome: {
		email: async (notification) => {
			const payload = notification.payload as WelcomeEmailInput;
			return toEmailDispatchResult(await sendWelcomeEmail(payload.email, payload.name));
		}
	},
	auth_google_linked: {
		email: async (notification) => {
			const payload = notification.payload as GoogleLinkedEmailInput;
			return toEmailDispatchResult(await sendGoogleLinkedEmail(payload.email));
		}
	},
	order_confirmation: {
		email: async (notification) =>
			toEmailDispatchResult(
				await sendOrderConfirmationEmail(notification.payload as OrderConfirmationInput)
			),
		sms: async (notification) =>
			toSmsDispatchResult(
				await sendOrderConfirmationSms(notification.payload as OrderConfirmationSmsInput)
			)
	},
	shipping_update: {
		email: async (notification) =>
			toEmailDispatchResult(await sendShippingUpdateEmail(notification.payload as ShippingUpdateInput)),
		sms: async (notification) =>
			toSmsDispatchResult(await sendShippingUpdateSms(notification.payload as ShippingUpdateSmsInput))
	},
	payment_update: {
		sms: async (notification) =>
			toSmsDispatchResult(await sendPaymentUpdateSms(notification.payload as PaymentUpdateSmsInput))
	},
	order_status_update: {
		sms: async (notification) =>
			toSmsDispatchResult(
				await sendOrderStatusUpdateSms(notification.payload as OrderStatusUpdateSmsInput)
			)
	},
	drop_launch: {
		email: async (notification) =>
			toEmailDispatchResult(
				await sendDropLaunchEmail(notification.payload as DropLaunchOutboxEmailInput)
			),
		sms: async (notification) =>
			toSmsDispatchResult(await sendDropLaunchSms(notification.payload as DropLaunchOutboxSmsInput))
	}
};

export async function sendClaimedNotification(
	notification: ClaimedNotificationDTO
): Promise<ProviderDispatchResult> {
	const handler = notificationDispatchers[notification.type]?.[notification.channel];
	if (!handler) {
		if (!notificationDispatchers[notification.type]) {
			return { ok: false, error: `UNSUPPORTED_NOTIFICATION_TYPE:${notification.type}` };
		}

		return { ok: false, error: `UNSUPPORTED_CHANNEL:${notification.channel}` };
	}

	return handler(notification);
}
