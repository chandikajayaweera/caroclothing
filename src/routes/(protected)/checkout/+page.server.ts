import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getCheckoutCart } from '$lib/server/modules/cart';
import { listMyAddresses, getMyDefaultAddress } from '$lib/server/modules/addresses';
import { listShippingDistrictOptions, listShippingQuotes } from '$lib/server/modules/shipping';
import { placeOrderFromCart } from '$lib/server/modules/orders';
import { createPaymentSession } from '$lib/server/modules/payments';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';
import type { SriLankaDistrict } from '$lib/server/modules/addresses';
import type { PaymentMethod } from '$lib/server/modules/orders';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const sessionToken = cookies.get('cart_session_token');
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;
	const ctx = { actor };

	const isFullUser = locals.user && !locals.user.isAnonymous;

	try {
		const cart = await getCheckoutCart(ctx, { sessionToken });
		const addresses = isFullUser ? await listMyAddresses(ctx) : { items: [] };
		const defaultAddress = isFullUser ? await getMyDefaultAddress(ctx) : null;
		const districtOptions = listShippingDistrictOptions();

		const defaultDistrict = defaultAddress?.district || null;
		const shippingQuotes = defaultDistrict
			? await listShippingQuotes({ district: defaultDistrict, subtotal: cart.subtotal })
			: [];

		return {
			cart,
			addresses: addresses.items,
			defaultAddress,
			districtOptions,
			shippingQuotes,
			user: locals.user
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	placeOrder: async ({ request, locals, cookies }) => {
		const sessionToken = cookies.get('cart_session_token');
		const actor = locals.user
			? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
			: null;
		const ctx = { actor };

		const formData = await request.formData();
		const shippingMethodId = formData.get('shippingMethodId') as string;
		const paymentMethod = formData.get('paymentMethod') as PaymentMethod;
		const customerNote = (formData.get('customerNote') as string) || null;

		const useSavedAddress = formData.get('useSavedAddress') === 'true';
		const addressId = formData.get('addressId') as string;

		let shippingAddress;

		if (useSavedAddress && addressId) {
			shippingAddress = { addressId };
		} else {
			const recipientName = formData.get('recipientName') as string;
			const phone = formData.get('phone') as string;
			const addressLine1 = formData.get('addressLine1') as string;
			const addressLine2 = (formData.get('addressLine2') as string) || null;
			const city = formData.get('city') as string;
			const district = formData.get('district') as SriLankaDistrict;
			const postalCode = (formData.get('postalCode') as string) || null;

			shippingAddress = {
				recipientName,
				phone,
				addressLine1,
				addressLine2,
				city,
				district,
				postalCode
			};
		}

		try {
			const order = await placeOrderFromCart(ctx, {
				sessionToken,
				shippingAddress,
				shippingMethodId,
				paymentMethod,
				customerNote
			});

			const sessionResult = await createPaymentSession(ctx, {
				orderId: order.id,
				method: paymentMethod
			});

			if (paymentMethod === 'cash_on_delivery' || paymentMethod === 'bank_transfer') {
				throw redirect(302, `/checkout/confirmation/${order.id}`);
			}

			if (sessionResult.redirectUrl && !sessionResult.paymentData) {
				throw redirect(302, sessionResult.redirectUrl);
			}

			return {
				success: true,
				order,
				paymentSession: sessionResult
			};
		} catch (error) {
			throwHttpFromAppError(error);
		}
	}
};
