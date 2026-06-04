import { browser } from '$app/environment';
import { page } from '$app/state';

class WishlistState {
	productIds = $state<string[]>([]);
	guestProductIds = $state<string[]>([]);

	constructor() {
		if (browser) {
			const saved = localStorage.getItem('guest_wishlist');
			if (saved) {
				try {
					this.guestProductIds = JSON.parse(saved);
				} catch {
					this.guestProductIds = [];
				}
			}
		}
	}

	setProductIds(ids: string[]) {
		this.productIds = ids;
	}

	get allIds() {
		const user = page.data.user;
		if (user) {
			return this.productIds;
		} else {
			return this.guestProductIds;
		}
	}

	has(productId: string) {
		return this.allIds.includes(productId);
	}

	async toggle(productId: string) {
		const user = page.data.user;

		if (!user) {
			// Unauthenticated guest user: use localStorage
			const exists = this.guestProductIds.includes(productId);
			if (exists) {
				this.guestProductIds = this.guestProductIds.filter((id) => id !== productId);
			} else {
				this.guestProductIds = [...this.guestProductIds, productId];
			}
			if (browser) {
				localStorage.setItem('guest_wishlist', JSON.stringify(this.guestProductIds));
			}
			return;
		}

		// Authenticated user: call database API
		const exists = this.productIds.includes(productId);

		// Optimistic update
		if (exists) {
			this.productIds = this.productIds.filter((id) => id !== productId);
		} else {
			this.productIds = [...this.productIds, productId];
		}

		try {
			const res = await fetch('/api/wishlist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					productId,
					action: exists ? 'remove' : 'add'
				})
			});

			if (!res.ok) {
				// Revert on error
				if (exists) {
					this.productIds = [...this.productIds, productId];
				} else {
					this.productIds = this.productIds.filter((id) => id !== productId);
				}
			}
		} catch (err) {
			console.error('Failed to toggle wishlist item:', err);
			// Revert on error
			if (exists) {
				this.productIds = [...this.productIds, productId];
			} else {
				this.productIds = this.productIds.filter((id) => id !== productId);
			}
		}
	}

	async syncLocalWishlist() {
		const user = page.data.user;
		if (!user || this.guestProductIds.length === 0) return;

		const idsToSync = [...this.guestProductIds];

		// Clear guest local state first to prevent double-execution
		this.guestProductIds = [];
		if (browser) {
			localStorage.removeItem('guest_wishlist');
		}

		for (const productId of idsToSync) {
			if (!this.productIds.includes(productId)) {
				// Optimistic update
				this.productIds = [...this.productIds, productId];
				try {
					await fetch('/api/wishlist', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ productId, action: 'add' })
					});
				} catch (err) {
					console.error(`Failed to sync product ${productId} to user wishlist:`, err);
				}
			}
		}
	}
}

export const wishlist = new WishlistState();
