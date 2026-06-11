import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type BagItem = {
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

const initialBag =
	browser && localStorage.getItem('bag')
		? JSON.parse(localStorage.getItem('bag')!)
		: {
				items: [],
				promoCode: null,
				discountAmount: 0
			};

export const bagStore = writable<{
	items: BagItem[];
	promoCode: string | null;
	discountAmount: number;
}>(initialBag);

if (browser) {
	bagStore.subscribe((value) => {
		localStorage.setItem('bag', JSON.stringify(value));
	});
}

export const bagCount = derived(bagStore, ($bag) =>
	$bag.items.reduce((acc, item) => acc + item.quantity, 0)
);

export const subtotal = derived(bagStore, ($bag) =>
	$bag.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0)
);
