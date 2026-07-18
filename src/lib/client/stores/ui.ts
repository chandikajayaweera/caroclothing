import { writable } from 'svelte/store';

export const uiStore = writable({
	bagDrawerOpen: false,
	wishlistDrawerOpen: false
});

export const closeBagDrawer = () => uiStore.update((s) => ({ ...s, bagDrawerOpen: false }));
export const openBagDrawer = () => uiStore.update((s) => ({ ...s, bagDrawerOpen: true }));
export const toggleBagDrawer = () =>
	uiStore.update((s) => ({ ...s, bagDrawerOpen: !s.bagDrawerOpen }));

export const closeWishlistDrawer = () =>
	uiStore.update((s) => ({ ...s, wishlistDrawerOpen: false }));
export const openWishlistDrawer = () => uiStore.update((s) => ({ ...s, wishlistDrawerOpen: true }));
export const toggleWishlistDrawer = () =>
	uiStore.update((s) => ({ ...s, wishlistDrawerOpen: !s.wishlistDrawerOpen }));
