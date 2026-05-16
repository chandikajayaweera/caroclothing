import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type CartItem = {
	id: string;
	variantId: string;
	productId: string;
	name: string;
	color: string;
	size: string;
	sku: string;
	unitPrice: number;
	quantity: number;
	image: string;
};

const initialCart =
	browser && localStorage.getItem('cart')
		? JSON.parse(localStorage.getItem('cart')!)
		: {
				items: [],
				promoCode: null,
				discountAmount: 0
			};

export const cartStore = writable<{
	items: CartItem[];
	promoCode: string | null;
	discountAmount: number;
}>(initialCart);

if (browser) {
	cartStore.subscribe((value) => {
		localStorage.setItem('cart', JSON.stringify(value));
	});
}

export const cartCount = derived(cartStore, ($cart) =>
	$cart.items.reduce((acc, item) => acc + item.quantity, 0)
);

export const subtotal = derived(cartStore, ($cart) =>
	$cart.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0)
);
