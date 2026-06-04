<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.png';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import CartDrawer from '$lib/components/cart/CartDrawer.svelte';
	import WishlistDrawer from '$lib/components/layout/WishlistDrawer.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import BottomNav from '$lib/components/layout/BottomNav.svelte';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import { onNavigate } from '$app/navigation';

	import { cart } from '$lib/client/modules/stores/cart.svelte';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';

	let { children, data } = $props();

	$effect(() => {
		cart.setCart(data?.cart);
		wishlist.setProductIds(data?.wishlistProductIds || []);
		if (data?.user) {
			wishlist.syncLocalWishlist();
		}
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	const showFooterRoutes = ['/', '/about'];
	const shouldShowFooter = $derived(showFooterRoutes.includes(page.url.pathname));
	const isAccountRoute = $derived(
		page.url.pathname === '/account' || page.url.pathname.startsWith('/account/')
	);
	const isAppRoute = $derived(
		page.url.pathname === '/app' || page.url.pathname.startsWith('/app/')
	);
	const routeAnimationKey = $derived.by(() => {
		if (isAccountRoute) return '/account';

		return page.url.pathname;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div
	class={isAppRoute
		? 'relative flex h-dvh min-h-0 flex-col overflow-hidden selection:bg-volt selection:text-void'
		: 'relative flex min-h-screen flex-col overflow-x-hidden selection:bg-volt selection:text-void'}
>
	{#if !isAppRoute}
		<Navbar />
		<BottomNav />
	{/if}

	{#if !isAppRoute}
		<CartDrawer />
		<WishlistDrawer />
	{/if}
	<Toast />

	<main
		class={isAppRoute
			? 'min-h-0 grow overflow-hidden'
			: 'grow pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0'}
	>
		{#if isAppRoute}
			{@render children()}
		{:else}
			{#key routeAnimationKey}
				<main in:fly={{ delay: 100, x: 10 }}>
					{@render children()}
				</main>
			{/key}
		{/if}
	</main>

	{#if shouldShowFooter}
		<Footer />
	{/if}
</div>
