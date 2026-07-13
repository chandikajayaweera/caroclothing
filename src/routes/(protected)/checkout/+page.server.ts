import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getCheckoutBag } from '$lib/server/modules/bag';
import {
	createAddress,
	getMyDefaultAddress,
	listMyAddresses,
	saveCheckoutAddressFormSchema
} from '$lib/server/modules/addresses';
import { getCheckoutCustomer } from '$lib/server/modules/auth';
import { listShippingDistrictOptions, listShippingQuotes } from '$lib/server/modules/shipping';
import { checkoutPlaceOrderFormSchema, placeOrderFromBag } from '$lib/server/modules/orders';
import {
	createCheckoutPaymentSession,
	listAvailableCheckoutPaymentMethods,
	validateCheckoutPaymentSelection
} from '$lib/server/modules/payments';
import {
	failFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import { ErrorCode, isAppError } from '$lib/server/infrastructure/errors';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const now = new Date();
	const sessionToken = cookies.get('bag_session_token');
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor, now };

	try {
		const bag = await getCheckoutBag(ctx, { sessionToken, now });
		if (!bag.canCheckout) {
			throw redirect(302, '/bag?error=' + encodeURIComponent(bag.blockingReasons.join(' ')));
		}
		const customer = await getCheckoutCustomer(ctx);
		const isFullUser = !customer.isAnonymous;
		const addresses = isFullUser ? await listMyAddresses(ctx) : { items: [] };
		const defaultAddress = isFullUser ? await getMyDefaultAddress(ctx) : null;
		const districtOptions = listShippingDistrictOptions();

		const defaultDistrict = defaultAddress?.district || null;
		const shippingQuotes = defaultDistrict
			? await listShippingQuotes({ district: defaultDistrict, subtotal: bag.subtotal })
			: [];

		return {
			bag,
			addresses: addresses.items,
			defaultAddress,
			districtOptions,
			shippingQuotes,
			paymentMethods: listAvailableCheckoutPaymentMethods(ctx),
			serverNow: now,
			user: customer,
			canSaveAddress: isFullUser
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	saveAddress: async ({ request, locals }) => {
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };

		if (!actor || actor.isAnonymous) {
			return fail(403, {
				saveAddressError: 'Sign in to save delivery addresses.'
			});
		}

		const formData = await request.formData();
		const parsed = saveCheckoutAddressFormSchema.safeParse(Object.fromEntries(formData));

		if (!parsed.success) {
			const saveAddressFieldErrors = Object.fromEntries(
				parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message])
			);
			return fail(400, {
				saveAddressError: 'Review the delivery address and try again.',
				saveAddressFieldErrors
			});
		}

		try {
			const savedAddress = await createAddress(ctx, parsed.data);
			return { saveAddressSuccess: true, savedAddress };
		} catch (error) {
			return failFromAppError(error);
		}
	},
	placeOrder: async ({ request, locals, cookies, platform }) => {
		const sessionToken = cookies.get('bag_session_token');
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = {
			actor,
			notificationWakeups: createCloudflareNotificationWakeups(platform)
		};

		const formData = await request.formData();
		const parsed = checkoutPlaceOrderFormSchema.safeParse(Object.fromEntries(formData));

		if (!parsed.success) {
			const fieldErrors = Object.fromEntries(
				parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message])
			);
			return fail(400, {
				message: 'Review the highlighted checkout details.',
				fieldErrors
			});
		}

		const values = parsed.data;
		let paymentSelection;
		try {
			paymentSelection = await validateCheckoutPaymentSelection(ctx, {
				method: values.paymentMethod,
				billingEmail: values.billingEmail
			});
		} catch (error) {
			return failFromAppError(error);
		}
		const shippingAddress = values.useSavedAddress
			? { addressId: values.addressId! }
			: {
					recipientName: values.recipientName!,
					phone: values.phone!,
					addressLine1: values.addressLine1!,
					addressLine2: values.addressLine2,
					city: values.city!,
					district: values.district!,
					postalCode: values.postalCode
				};

		if (paymentSelection.method === 'cash_on_delivery') {
			let order;
			try {
				order = await placeOrderFromBag(ctx, {
					sessionToken,
					shippingAddress,
					shippingMethodId: values.shippingMethodId,
					paymentMethod: paymentSelection.method,
					customerNote: values.customerNote
				});
			} catch (error) {
				if (isAppError(error) && error.code === ErrorCode.CHECKOUT_SESSION_EXPIRED) {
					throw redirect(
						303,
						`/bag?error=${encodeURIComponent('Checkout expired. Start checkout again when you are ready.')}`
					);
				}
				return failFromAppError(error);
			}
			throw redirect(303, `/checkout/confirmation/${order.id}`);
		}

		try {
			const paymentSession = await createCheckoutPaymentSession(ctx, {
				sessionToken,
				shippingAddress,
				shippingMethodId: values.shippingMethodId,
				paymentMethod: paymentSelection.method,
				billingEmail: paymentSelection.billingEmail,
				customerNote: values.customerNote
			});
			return { success: true, paymentSession };
		} catch (error) {
			if (isAppError(error) && error.code === ErrorCode.CHECKOUT_SESSION_EXPIRED) {
				throw redirect(
					303,
					`/bag?error=${encodeURIComponent('Checkout expired. Start checkout again when you are ready.')}`
				);
			}
			return failFromAppError(error);
		}
	}
};
