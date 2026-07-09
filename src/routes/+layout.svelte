<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.png';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import BagDrawer from '$lib/components/bag/BagDrawer.svelte';
	import WishlistDrawer from '$lib/components/layout/WishlistDrawer.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import BottomNav from '$lib/components/layout/BottomNav.svelte';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';

	let { children, data } = $props();

	$effect(() => {
		const bagData = data?.bag;
		const wishlistProductIds = data?.wishlistProductIds || [];
		const user = data?.user;

		untrack(() => {
			bag.setBag(bagData);
			wishlist.setProductIds(wishlistProductIds);
			if (user) {
				wishlist.syncLocalWishlist();
			}
		});
	});

	onMount(() => {
		const refreshBagAvailability = () => {
			if (document.visibilityState === 'visible' && bag.items.length > 0) {
				void bag.refresh();
			}
		};
		const availabilityPoll = setInterval(refreshBagAvailability, 3000);
		const initialTimer = setTimeout(refreshBagAvailability, 100);
		window.addEventListener('focus', refreshBagAvailability);
		document.addEventListener('visibilitychange', refreshBagAvailability);
		return () => {
			clearTimeout(initialTimer);
			clearInterval(availabilityPoll);
			window.removeEventListener('focus', refreshBagAvailability);
			document.removeEventListener('visibilitychange', refreshBagAvailability);
		};
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		const fromPath = navigation.from?.url.pathname ?? page.url.pathname;
		const toPath = navigation.to?.url.pathname;
		if (isAppPathname(fromPath) || (toPath && isAppPathname(toPath))) return;

		return new Promise<void>((resolve) => {
			try {
				const transition = document.startViewTransition(async () => {
					resolve();
					await navigation.complete;
				});
				void transition.finished.catch(() => {});
			} catch {
				resolve();
			}
		});
	});

	// GPU-composited slide transition — avoids iOS repaint jank
	function slideFade(node: Element, { delay = 0, duration = 220 } = {}) {
		return {
			delay,
			duration,
			css: (t: number) => {
				const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
				const x = (1 - ease) * 12; // px — keep small to stay subtle
				const opacity = ease;
				// translate3d forces the browser to promote this to its own GPU layer
				return `transform: translate3d(${x}px, 0, 0); opacity: ${opacity}; will-change: transform, opacity;`;
			}
		};
	}

	const showFooterRoutes = ['/', '/about'];
	const shouldShowFooter = $derived(showFooterRoutes.includes(page.url.pathname));
	function isAppPathname(pathname: string): boolean {
		return pathname === '/app' || pathname.startsWith('/app/');
	}
	const isAccountRoute = $derived(
		page.url.pathname === '/account' || page.url.pathname.startsWith('/account/')
	);
	const isAppRoute = $derived(isAppPathname(page.url.pathname));
	const routeAnimationKey = $derived.by(() => {
		if (isAccountRoute) return '/account';
		return page.url.pathname;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div
	class={isAppRoute
		? 'relative flex h-dvh min-h-0 flex-col overflow-hidden selection:bg-volt selection:text-void'
		: 'relative flex min-h-screen flex-col selection:bg-volt selection:text-void'}
>
	{#if !isAppRoute}
		<Navbar />
		<BottomNav />
	{/if}
	{#if !isAppRoute}
		<BagDrawer />
		<WishlistDrawer />
	{/if}
	<Toast />
	<main
		class={isAppRoute
			? 'min-h-0 grow overflow-hidden'
			: 'grow overflow-x-hidden pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0'}
	>
		{#if isAppRoute}
			{@render children()}
		{:else}
			{#key routeAnimationKey}
				<div in:slideFade class="route-transition-wrapper">
					{@render children()}
				</div>
			{/key}
		{/if}
	</main>
	{#if shouldShowFooter}
		<Footer />
	{/if}
</div>

<style>
	.route-transition-wrapper {
		isolation: isolate;
	}

	@media (prefers-reduced-motion: reduce) {
		.route-transition-wrapper {
			animation: none !important;
			transition: none !important;
		}
	}
</style>
