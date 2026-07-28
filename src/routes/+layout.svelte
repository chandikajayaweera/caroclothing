<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.png';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import BagDrawer from '$lib/components/bag/BagDrawer.svelte';
	import WishlistDrawer from '$lib/components/layout/WishlistDrawer.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import BottomNav from '$lib/components/layout/BottomNav.svelte';
	import {
		getNavigationLabel,
		isDataNavigation
	} from '$lib/components/navigation/navigation-feedback';
	import { navigating, page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { bag } from '$lib/client/stores/bag.svelte';
	import { wishlist } from '$lib/client/stores/wishlist.svelte';
	import {
		BAG_REFRESH_INTERVAL_MS,
		RETURN_REFRESH_MIN_FRESH_MS,
		getExpiryRefreshDelay,
		getNextRefreshDelay
	} from '$lib/client/availability/refresh';

	let { children, data } = $props();
	let showSlowNavigationMessage = $state(false);

	const isActiveDataNavigation = $derived(
		isDataNavigation(
			navigating.from?.url ?? null,
			navigating.to?.url ?? null,
			navigating.willUnload === true
		)
	);
	const navigationTargetPathname = $derived(
		isActiveDataNavigation ? (navigating.to?.url.pathname ?? null) : null
	);
	const navigationLabel = $derived(
		navigationTargetPathname ? getNavigationLabel(navigationTargetPathname) : 'next page'
	);

	$effect(() => {
		const active = isActiveDataNavigation;
		showSlowNavigationMessage = false;

		if (!active) return;

		const slowTimer = setTimeout(() => {
			showSlowNavigationMessage = true;
		}, 4_000);

		return () => {
			clearTimeout(slowTimer);
		};
	});

	$effect(() => {
		const bagData = data?.bag;
		const wishlistProductIds = data?.wishlistProductIds || [];
		const user = data?.user;

		untrack(() => {
			bag.applyServerSnapshot(bagData);
			wishlist.setProductIds(wishlistProductIds);
			if (user) {
				wishlist.syncLocalWishlist();
			}
		});
	});

	$effect(() => {
		if (isAppPathname(page.url.pathname)) return;

		const expiryDelays = bag.items
			.map((item) => getExpiryRefreshDelay(item.reservationExpiresAt))
			.filter((delay): delay is number => delay !== null);
		if (expiryDelays.length === 0) return;

		const expiryTimer = setTimeout(
			() => {
				if (document.visibilityState === 'visible') {
					void bag.refresh();
				}
			},
			Math.min(...expiryDelays)
		);

		return () => clearTimeout(expiryTimer);
	});

	onMount(() => {
		let pollTimer: ReturnType<typeof setTimeout> | null = null;
		let returnRefreshRequest: Promise<void> | null = null;
		let failureCount = 0;
		let stopped = false;

		const schedulePoll = () => {
			if (pollTimer) clearTimeout(pollTimer);
			pollTimer = setTimeout(
				async () => {
					if (stopped) return;
					if (
						!isAppPathname(page.url.pathname) &&
						document.visibilityState === 'visible' &&
						bag.items.length > 0
					) {
						const succeeded = await bag.refresh({ minFreshMs: BAG_REFRESH_INTERVAL_MS });
						if (stopped) return;
						failureCount = succeeded ? 0 : failureCount + 1;
					}
					if (stopped) return;
					schedulePoll();
				},
				getNextRefreshDelay(BAG_REFRESH_INTERVAL_MS, failureCount)
			);
		};

		const refreshAfterReturn = () => {
			if (
				returnRefreshRequest ||
				isAppPathname(page.url.pathname) ||
				document.visibilityState !== 'visible' ||
				bag.items.length === 0
			) {
				return;
			}

			returnRefreshRequest = (async () => {
				const succeeded = await bag.refresh({ minFreshMs: RETURN_REFRESH_MIN_FRESH_MS });
				if (stopped) return;
				failureCount = succeeded ? 0 : failureCount + 1;
				schedulePoll();
			})().finally(() => {
				returnRefreshRequest = null;
			});
		};

		schedulePoll();
		window.addEventListener('focus', refreshAfterReturn);
		document.addEventListener('visibilitychange', refreshAfterReturn);
		return () => {
			stopped = true;
			if (pollTimer) clearTimeout(pollTimer);
			window.removeEventListener('focus', refreshAfterReturn);
			document.removeEventListener('visibilitychange', refreshAfterReturn);
		};
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

{#if isActiveDataNavigation}
	<div
		class="navigation-progress fixed inset-x-0 top-0 z-[120] h-[3px] overflow-hidden bg-void"
		role="progressbar"
		aria-label={`Loading ${navigationLabel}`}
	>
		<div class="navigation-progress__bar h-full bg-volt"></div>
	</div>
{/if}

<p class="sr-only" aria-live="polite" aria-atomic="true">
	{#if isActiveDataNavigation}
		{showSlowNavigationMessage
			? `Still loading ${navigationLabel}.`
			: `Loading ${navigationLabel}.`}
	{/if}
</p>

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
		aria-busy={isActiveDataNavigation}
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

	.navigation-progress__bar {
		width: 42%;
		transform: translate3d(-110%, 0, 0);
		animation: navigation-progress 1.05s ease-in-out infinite;
		will-change: transform;
	}

	@keyframes navigation-progress {
		to {
			transform: translate3d(350%, 0, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.route-transition-wrapper {
			animation: none !important;
			transition: none !important;
		}

		.navigation-progress__bar {
			width: 100%;
			transform: none;
			animation: none;
			opacity: 0.72;
		}
	}
</style>
