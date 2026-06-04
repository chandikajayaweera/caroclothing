import type { CartDTO, CartItemDTO } from '$lib/server/modules/cart/cart.types';

class CartState {
	id = $state<string>('');
	items = $state<CartItemDTO[]>([]);
	promoCodeId = $state<string | null>(null);
	discountAmount = $state<number>(0);
	subtotal = $derived(this.items.reduce((sum, item) => sum + item.lineTotal, 0));
	count = $derived(this.items.reduce((sum, item) => sum + item.quantity, 0));
	totalBeforeShipping = $derived(Math.max(0, this.subtotal - this.discountAmount));
	hasUnavailableItems = $derived(this.items.some((item) => item.availabilityStatus === 'unavailable'));

	setCart(cart: (CartDTO & { promoCodeId?: string | null }) | null) {
		if (!cart) {
			this.id = '';
			this.items = [];
			this.promoCodeId = null;
			this.discountAmount = 0;
			return;
		}
		this.id = cart.id;
		this.items = cart.items || [];
		this.promoCodeId = cart.promoCodeId ?? null;
		this.discountAmount = cart.discountAmount || 0;
	}

	async refresh() {
		try {
			const res = await fetch('/api/cart');
			if (res.ok) {
				const cartData = (await res.json()) as (CartDTO & { promoCodeId?: string | null }) | null;
				this.setCart(cartData);
			}
		} catch (err) {
			console.error('Failed to refresh cart state:', err);
		}
	}
}

export const cart = new CartState();
