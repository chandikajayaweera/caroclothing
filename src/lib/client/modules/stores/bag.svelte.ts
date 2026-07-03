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
	private mutationVersion = 0;
	private pendingMutations = 0;

	// Per-item mutation & debounce state owned by store
	private itemDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private itemRollbacks = new Map<string, number>();

	startMutation(): number {
		this.pendingMutations++;
		return ++this.mutationVersion;
	}

	endMutation() {
		if (this.pendingMutations > 0) {
			this.pendingMutations--;
		}
	}

	setBag(bag: BagDTO | null, version?: number) {
		if (version !== undefined && version < this.mutationVersion) {
			return;
		}
		if (version === undefined && this.pendingMutations > 0) {
			return;
		}
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

	updateItemQuantity(bagItemId: string, delta: number, maxQuantityAvailable: number) {
		const itemIndex = this.items.findIndex((item) => item.id === bagItemId);
		if (itemIndex === -1) return;

		const existing = this.items[itemIndex];
		const next = existing.quantity + delta;
		if (next < 1 || next > maxQuantityAvailable) return;

		// Save rollback value for sequence if not already saved
		if (!this.itemRollbacks.has(bagItemId)) {
			this.itemRollbacks.set(bagItemId, existing.quantity);
		}

		// Update display instantly
		this.updateItemQuantityOptimistically(bagItemId, next);

		// If a debounce timer is already running for this item, clear it (keep mutation active)
		const existingTimer = this.itemDebounceTimers.get(bagItemId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		} else {
			// First click of a sequence -> start mutation
			this.startMutation();
		}

		const newTimer = setTimeout(async () => {
			this.itemDebounceTimers.delete(bagItemId);
			const targetItem = this.items.find((i) => i.id === bagItemId);
			const quantityToSend = targetItem ? targetItem.quantity : next;
			const rollbackQuantity = this.itemRollbacks.get(bagItemId) ?? existing.quantity;
			this.itemRollbacks.delete(bagItemId);

			const version = this.mutationVersion;

			try {
				const res = await fetch('/api/bag', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'update', bagItemId, quantity: quantityToSend })
				});
				if (res.ok) {
					const updated = (await res.json()) as BagDTO;
					this.setBag(updated, version);
				} else {
					this.updateItemQuantityOptimistically(bagItemId, rollbackQuantity);
				}
			} catch (err) {
				console.error('Failed to update quantity:', err);
				this.updateItemQuantityOptimistically(bagItemId, rollbackQuantity);
			} finally {
				this.endMutation();
			}
		}, 350);

		this.itemDebounceTimers.set(bagItemId, newTimer);
	}

	async removeItem(bagItemId: string) {
		// If item is mid-debounce, cancel timer and clean up mutation counter
		const existingTimer = this.itemDebounceTimers.get(bagItemId);
		if (existingTimer) {
			clearTimeout(existingTimer);
			this.itemDebounceTimers.delete(bagItemId);
			this.itemRollbacks.delete(bagItemId);
			this.endMutation();
		}

		const previousItems = this.removeItemOptimistically(bagItemId);
		const version = this.startMutation();

		try {
			const res = await fetch('/api/bag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'remove', bagItemId })
			});
			if (res.ok) {
				const updated = (await res.json()) as BagDTO;
				this.setBag(updated, version);
			} else {
				this.items = previousItems;
			}
		} catch (err) {
			console.error('Failed to remove item:', err);
			this.items = previousItems;
		} finally {
			this.endMutation();
		}
	}

	removeItemOptimistically(bagItemId: string) {
		const originalItems = JSON.parse(JSON.stringify(this.items)) as BagItemDTO[];
		this.items = this.items.filter((item) => item.id !== bagItemId);
		return originalItems;
	}

	async refresh() {
		if (this.pendingMutations > 0) return;
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
