import { writable } from 'svelte/store'

export const uiStore = writable({
  cartDrawerOpen: false,
})

export const closeCartDrawer = () => uiStore.update(s => ({ ...s, cartDrawerOpen: false }))
export const openCartDrawer = () => uiStore.update(s => ({ ...s, cartDrawerOpen: true }))
export const toggleCartDrawer = () => uiStore.update(s => ({ ...s, cartDrawerOpen: !s.cartDrawerOpen }))
