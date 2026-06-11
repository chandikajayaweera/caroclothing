import type { BagDTO, BagItemDTO } from '$lib/server/modules/bag/bag.types';

class BagState {
	id = $state<string>('');
	items = $state<BagItemDTO[]>([]);
	promoCodeId = $state<string | null>(null);
	promoCode = $state<string | null>(null);
	discountAmount = $state<number>(0);
	freeShippingThreshold = $state<number | null>(null);
	subtotal = $derived(this.items.reduce((sum, item) => sum + item.lineTotal, 0));
	count = $derived(this.items.reduce((sum, item) => sum + item.quantity, 0));
	totalBeforeShipping = $derived(Math.max(0, this.subtotal - this.discountAmount));
	hasUnavailableItems = $derived(
		this.items.some((item) => item.availabilityStatus === 'unavailable')
	);
	hasReservedItems = $derived(this.items.some((item) => item.availabilityStatus === 'reserved'));
	private refreshRequest: Promise<void> | null = null;

	setBag(bag: BagDTO | null) {
		if (!bag) {
			this.id = '';
			this.items = [];
			this.promoCodeId = null;
			this.promoCode = null;
			this.discountAmount = 0;
			this.freeShippingThreshold = null;
			return;
		}
		this.id = bag.id;
		this.items = bag.items || [];
		this.promoCodeId = bag.promoCodeId ?? null;
		this.promoCode = bag.promoCode ?? null;
		this.discountAmount = bag.discountAmount || 0;
		this.freeShippingThreshold = bag.freeShippingThreshold ?? null;
	}

	updateItemQuantityOptimistically(bagItemId: string, newQuantity: number) {
		const originalItems = JSON.parse(JSON.stringify(this.items)) as BagItemDTO[];
		const itemIndex = this.items.findIndex((item) => item.id === bagItemId);
		if (itemIndex !== -1) {
			const existing = this.items[itemIndex];
			this.items = [
				...this.items.slice(0, itemIndex),
				{ ...existing, quantity: newQuantity, lineTotal: existing.unitPrice * newQuantity },
				...this.items.slice(itemIndex + 1)
			];
		}
		return originalItems;
	}

	removeItemOptimistically(bagItemId: string) {
		const originalItems = JSON.parse(JSON.stringify(this.items)) as BagItemDTO[];
		this.items = this.items.filter((item) => item.id !== bagItemId);
		return originalItems;
	}

	async refresh() {
		if (this.refreshRequest) return this.refreshRequest;

		this.refreshRequest = (async () => {
			try {
				const res = await fetch('/api/bag', { cache: 'no-store' });
				if (res.ok) {
					const bagData = (await res.json()) as
						| (BagDTO & {
								promoCodeId?: string | null;
						  })
						| null;
					this.setBag(bagData);
				}
			} catch (err) {
				console.error('Failed to refresh bag state:', err);
			} finally {
				this.refreshRequest = null;
			}
		})();

		return this.refreshRequest;
	}
}

export const bag = new BagState();
