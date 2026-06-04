import { writable } from 'svelte/store';

export const uiStore = writable({
	cartDrawerOpen: false,
	wishlistDrawerOpen: false
});

export const closeCartDrawer = () => uiStore.update((s) => ({ ...s, cartDrawerOpen: false }));
export const openCartDrawer = () => uiStore.update((s) => ({ ...s, cartDrawerOpen: true }));
export const toggleCartDrawer = () =>
	uiStore.update((s) => ({ ...s, cartDrawerOpen: !s.cartDrawerOpen }));

export const closeWishlistDrawer = () => uiStore.update((s) => ({ ...s, wishlistDrawerOpen: false }));
export const openWishlistDrawer = () => uiStore.update((s) => ({ ...s, wishlistDrawerOpen: true }));
export const toggleWishlistDrawer = () =>
	uiStore.update((s) => ({ ...s, wishlistDrawerOpen: !s.wishlistDrawerOpen }));

