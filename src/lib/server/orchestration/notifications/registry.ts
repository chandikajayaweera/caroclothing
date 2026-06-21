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
import { toEmailDispatchResult, toSmsDispatchResult, type ProviderDispatchResult } from './results';

type NotificationDispatchKey =
	| 'auth_welcome:email'
	| 'auth_google_linked:email'
	| 'order_confirmation:email'
	| 'order_confirmation:sms'
	| 'shipping_update:email'
	| 'shipping_update:sms'
	| 'payment_update:sms'
	| 'order_status_update:sms'
	| 'drop_launch:email'
	| 'drop_launch:sms';

type DispatchPayloadByKey = {
	'auth_welcome:email': WelcomeEmailInput;
	'auth_google_linked:email': GoogleLinkedEmailInput;
	'order_confirmation:email': OrderConfirmationInput;
	'order_confirmation:sms': OrderConfirmationSmsInput;
	'shipping_update:email': ShippingUpdateInput;
	'shipping_update:sms': ShippingUpdateSmsInput;
	'payment_update:sms': PaymentUpdateSmsInput;
	'order_status_update:sms': OrderStatusUpdateSmsInput;
	'drop_launch:email': DropLaunchOutboxEmailInput;
	'drop_launch:sms': DropLaunchOutboxSmsInput;
};

type DispatchTypeForKey<TKey extends NotificationDispatchKey> =
	TKey extends `${infer TType}:${string}` ? Extract<TType, NotificationOutboxType> : never;

type DispatchChannelForKey<TKey extends NotificationDispatchKey> =
	TKey extends `${string}:${infer TChannel}` ? Extract<TChannel, NotificationChannel> : never;

type ClaimedNotificationForKey<TKey extends NotificationDispatchKey> = Omit<
	ClaimedNotificationDTO,
	'type' | 'channel' | 'payload'
> & {
	type: DispatchTypeForKey<TKey>;
	channel: DispatchChannelForKey<TKey>;
	payload: DispatchPayloadByKey[TKey];
};

type NotificationDispatchRegistry = {
	[TKey in NotificationDispatchKey]: (
		notification: ClaimedNotificationForKey<TKey>
	) => Promise<ProviderDispatchResult>;
};

const notificationDispatchers = {
	'auth_welcome:email': async (notification) => {
		return toEmailDispatchResult(
			await sendWelcomeEmail(notification.payload.email, notification.payload.name)
		);
	},
	'auth_google_linked:email': async (notification) => {
		return toEmailDispatchResult(await sendGoogleLinkedEmail(notification.payload.email));
	},
	'order_confirmation:email': async (notification) => {
		return toEmailDispatchResult(await sendOrderConfirmationEmail(notification.payload));
	},
	'order_confirmation:sms': async (notification) => {
		return toSmsDispatchResult(await sendOrderConfirmationSms(notification.payload));
	},
	'shipping_update:email': async (notification) => {
		return toEmailDispatchResult(await sendShippingUpdateEmail(notification.payload));
	},
	'shipping_update:sms': async (notification) => {
		return toSmsDispatchResult(await sendShippingUpdateSms(notification.payload));
	},
	'payment_update:sms': async (notification) => {
		return toSmsDispatchResult(await sendPaymentUpdateSms(notification.payload));
	},
	'order_status_update:sms': async (notification) => {
		return toSmsDispatchResult(await sendOrderStatusUpdateSms(notification.payload));
	},
	'drop_launch:email': async (notification) => {
		return toEmailDispatchResult(await sendDropLaunchEmail(notification.payload));
	},
	'drop_launch:sms': async (notification) => {
		return toSmsDispatchResult(await sendDropLaunchSms(notification.payload));
	}
} satisfies NotificationDispatchRegistry;

export async function sendClaimedNotification(
	notification: ClaimedNotificationDTO
): Promise<ProviderDispatchResult> {
	const key = toNotificationDispatchKey(notification.type, notification.channel);

	if (!key) {
		if (hasSupportedType(notification.type)) {
			return { ok: false, error: `UNSUPPORTED_CHANNEL:${notification.channel}` };
		}

		return { ok: false, error: `UNSUPPORTED_NOTIFICATION_TYPE:${notification.type}` };
	}

	return dispatchWithTypedPayload(key, notification);
}

function toNotificationDispatchKey(
	type: NotificationOutboxType,
	channel: NotificationChannel
): NotificationDispatchKey | null {
	const key = `${type}:${channel}`;
	return isNotificationDispatchKey(key) ? key : null;
}

function isNotificationDispatchKey(key: string): key is NotificationDispatchKey {
	return Object.prototype.hasOwnProperty.call(notificationDispatchers, key);
}

function hasSupportedType(type: NotificationOutboxType): boolean {
	return Object.keys(notificationDispatchers).some((key) => key.startsWith(`${type}:`));
}

function dispatchWithTypedPayload(
	key: NotificationDispatchKey,
	notification: ClaimedNotificationDTO
): Promise<ProviderDispatchResult> {
	switch (key) {
		case 'auth_welcome:email':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'auth_google_linked:email':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'order_confirmation:email':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'order_confirmation:sms':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'shipping_update:email':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'shipping_update:sms':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'payment_update:sms':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'order_status_update:sms':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'drop_launch:email':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
		case 'drop_launch:sms':
			return notificationDispatchers[key](toClaimedNotificationForKey(notification, key));
	}
}

function toClaimedNotificationForKey<TKey extends NotificationDispatchKey>(
	notification: ClaimedNotificationDTO,
	key: TKey
): ClaimedNotificationForKey<TKey> {
	const [type, channel] = key.split(':');

	if (notification.type !== type || notification.channel !== channel) {
		throw new Error(`Notification dispatch key mismatch: ${key}`);
	}

	return notification as ClaimedNotificationForKey<TKey>;
}
