import type { BagDTO, BagItemDTO } from '$lib/server/modules/bag/bag.types';
import { isRefreshStale, shouldApplySnapshot } from '../availability-refresh';

class BagState {
	id = $state<string>('');
	items = $state<BagItemDTO[]>([]);
	promoCodeId = $state<string | null>(null);
	promoCode = $state<string | null>(null);
	promoMinOrderAmount = $state<number | null>(null);
	discountAmount = $state<number>(0);
	freeShippingThreshold = $state<number | null>(null);
	promoError = $state<string>('');
	isApplyingPromo = $state<boolean>(false);
	isRemovingPromo = $state<boolean>(false);

	lastDiscountAmount = $state<number>(0);

	subtotal = $derived(this.items.reduce((sum, item) => sum + item.lineTotal, 0));
	count = $derived(this.items.reduce((sum, item) => sum + item.quantity, 0));
	hasUnavailableItems = $derived(
		this.items.some((item) => item.availabilityStatus === 'unavailable')
	);
	hasInsufficientItems = $derived(
		this.items.some((item) => item.availabilityStatus === 'insufficient')
	);
	hasReservedItems = $derived(this.items.some((item) => item.availabilityStatus === 'reserved'));

	isPromoActive = $derived(
		this.promoCodeId !== null &&
			this.promoCode !== null &&
			(this.promoMinOrderAmount === null || this.subtotal >= this.promoMinOrderAmount)
	);
	isPromoMinNotMet = $derived(
		this.promoCode !== null &&
			this.promoMinOrderAmount !== null &&
			this.subtotal < this.promoMinOrderAmount
	);

	effectiveDiscountAmount = $derived(
		this.isPromoActive
			? this.discountAmount > 0
				? this.discountAmount
				: this.lastDiscountAmount
			: 0
	);
	totalBeforeShipping = $derived(Math.max(0, this.subtotal - this.effectiveDiscountAmount));

	private refreshRequest: Promise<boolean> | null = null;
	private lastSyncedAt: number | null = null;
	private mutationVersion = 0;
	private pendingMutations = 0;
	private needsRefreshAfterMutations = false;

	private prevPromoCode: string | null = null;
	private prevPromoWasActive = false;

	// Per-item mutation & debounce state owned by store
	private itemDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private itemRollbacks = new Map<string, number>();
	private itemTargetQuantities = new Map<string, number>();
	private itemMutationVersions = new Map<string, number>();

	private checkPromoStatusTransitions() {
		const currentCode = this.promoCode;
		const currentActive = this.isPromoActive;
		const minNotMet = this.isPromoMinNotMet;

		if (this.prevPromoCode === currentCode) {
			if (this.prevPromoWasActive && minNotMet) {
				this.prevPromoWasActive = false;
			} else if (!this.prevPromoWasActive && currentActive && currentCode) {
				this.prevPromoWasActive = true;
			}
		} else {
			this.prevPromoCode = currentCode;
			this.prevPromoWasActive = currentActive;
		}
	}

	startMutation(): number {
		this.pendingMutations++;
		return ++this.mutationVersion;
	}

	endMutation() {
		if (this.pendingMutations > 0) {
			this.pendingMutations--;
		}

		if (this.pendingMutations === 0 && this.needsRefreshAfterMutations) {
			this.needsRefreshAfterMutations = false;
			const activeRefresh = this.refreshRequest;
			if (activeRefresh) {
				void activeRefresh.finally(() => {
					if (this.pendingMutations === 0) {
						void this.refresh();
					} else {
						this.needsRefreshAfterMutations = true;
					}
				});
			} else {
				void this.refresh();
			}
		}
	}

	setBag(bag: BagDTO | null, version?: number): boolean {
		if (version !== undefined && !shouldApplySnapshot(version, this.mutationVersion)) {
			if (this.pendingMutations > 0) this.needsRefreshAfterMutations = true;
			return false;
		}
		if (version === undefined && this.pendingMutations > 0) {
			return false;
		}
		this.lastSyncedAt = Date.now();
		if (!bag) {
			this.id = '';
			this.items = [];
			this.promoCodeId = null;
			this.promoCode = null;
			this.promoMinOrderAmount = null;
			this.discountAmount = 0;
			this.lastDiscountAmount = 0;
			this.freeShippingThreshold = null;
			this.checkPromoStatusTransitions();
			return true;
		}
		this.id = bag.id;
		this.items = bag.items || [];
		this.promoCodeId = bag.promoCodeId ?? null;
		this.promoCode = bag.promoCode ?? null;
		this.promoMinOrderAmount = bag.promoMinOrderAmount ?? null;
		this.discountAmount = bag.discountAmount || 0;
		if (bag.discountAmount > 0) {
			this.lastDiscountAmount = bag.discountAmount;
		}
		this.freeShippingThreshold = bag.freeShippingThreshold ?? null;
		this.checkPromoStatusTransitions();
		return true;
	}

	applyMutationResult(bag: BagDTO | null) {
		const version = ++this.mutationVersion;
		this.setBag(bag, version);
	}

	applyServerSnapshot(bag: BagDTO | null): boolean {
		if (this.pendingMutations > 0) return false;

		const version = ++this.mutationVersion;
		return this.setBag(bag, version);
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
			this.checkPromoStatusTransitions();
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
		this.itemTargetQuantities.set(bagItemId, next);

		// If a debounce timer is already running for this item, clear it (keep mutation active)
		const existingTimer = this.itemDebounceTimers.get(bagItemId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		} else {
			// First click of a sequence -> start mutation
			this.itemMutationVersions.set(bagItemId, this.startMutation());
		}

		const newTimer = setTimeout(async () => {
			this.itemDebounceTimers.delete(bagItemId);
			const quantityToSend = this.itemTargetQuantities.get(bagItemId) ?? next;
			const rollbackQuantity = this.itemRollbacks.get(bagItemId) ?? existing.quantity;
			this.itemRollbacks.delete(bagItemId);
			this.itemTargetQuantities.delete(bagItemId);

			const version = this.itemMutationVersions.get(bagItemId) ?? this.mutationVersion;
			this.itemMutationVersions.delete(bagItemId);

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
				console.error('[bag] Failed to update quantity:', err);
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
			this.itemTargetQuantities.delete(bagItemId);
			this.itemMutationVersions.delete(bagItemId);
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
			console.error('[bag] Failed to remove item:', err);
			this.items = previousItems;
		} finally {
			this.endMutation();
		}
	}

	removeItemOptimistically(bagItemId: string) {
		const originalItems = JSON.parse(JSON.stringify(this.items)) as BagItemDTO[];
		this.items = this.items.filter((item) => item.id !== bagItemId);
		this.checkPromoStatusTransitions();
		return originalItems;
	}

	async applyPromo(code: string) {
		if (!code.trim() || this.isApplyingPromo || this.isRemovingPromo) return;
		this.promoError = '';
		this.isApplyingPromo = true;
		const version = this.startMutation();
		try {
			const res = await fetch('/api/bag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'applyPromo', code })
			});
			if (res.ok) {
				const updated = (await res.json()) as BagDTO;
				this.setBag(updated, version);
			} else {
				const errData = (await res.json()) as { message?: string };
				this.promoError = errData?.message || 'Invalid promo code';
			}
		} catch (err) {
			this.promoError = 'Failed to apply promo';
			console.error('[bag] Failed to apply promo code:', err);
		} finally {
			this.isApplyingPromo = false;
			this.endMutation();
		}
	}

	async removePromo() {
		if (this.isApplyingPromo || this.isRemovingPromo) return;
		this.isRemovingPromo = true;
		const version = this.startMutation();
		try {
			const res = await fetch('/api/bag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'removePromo' })
			});
			if (res.ok) {
				const updated = (await res.json()) as BagDTO;
				this.setBag(updated, version);
			}
		} catch (err) {
			console.error('[bag] Failed to remove promo code:', err);
		} finally {
			this.isRemovingPromo = false;
			this.endMutation();
		}
	}

	clearPromoError() {
		this.promoError = '';
	}

	async refresh(options: { minFreshMs?: number } = {}): Promise<boolean> {
		if (this.pendingMutations > 0) return false;
		if (options.minFreshMs && !isRefreshStale(this.lastSyncedAt, options.minFreshMs)) {
			return true;
		}
		if (this.refreshRequest) return this.refreshRequest;
		const snapshotVersion = this.mutationVersion;

		this.refreshRequest = (async () => {
			try {
				const res = await fetch('/api/bag', { cache: 'no-store' });
				if (!res.ok) return false;

				const bagData = (await res.json()) as
					| (BagDTO & {
							promoCodeId?: string | null;
					  })
					| null;
				return this.setBag(bagData, snapshotVersion);
			} catch (err) {
				console.error('[bag] Failed to refresh bag state:', err);
				return false;
			} finally {
				this.refreshRequest = null;
			}
		})();

		return this.refreshRequest;
	}
}

export const bag = new BagState();
