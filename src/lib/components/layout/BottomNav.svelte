<script lang="ts">
	import { page } from '$app/state';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';
	import { authClient } from '$lib/client/modules/auth';
	import { toggleWishlistDrawer, uiStore } from '$lib/client/modules/stores/ui';

	const session = authClient.useSession();

	// Use $derived to make the array reactive to changes in $session
	const navItems = $derived([
		{
			label: 'Home',
			href: '/',
			icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      `
		},
		{
			label: 'Shop',
			href: '/shop',
			icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2-1 2 2 0 0 1-2 1 2 2 0 0 1-2-2V7"/></svg>
      `
		},
		{
			label: 'Drops',
			href: '/drops',
			icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-radio-tower"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/><path d="M12 12v10"/><path d="m12 12-4 8"/><path d="m12 12 4 8"/></svg>
      `
		},
		{
			label: 'Bag',
			href: '/bag',
			icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-bag"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
      `
		},
		{
			label: 'Wishlist',
			href: '#wishlist',
			icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
      `
		},
		{
			label: $session?.data ? 'Account' : 'Sign In',
			href: $session?.data ? '/account' : '/sign-in',
			icon: $session?.data
				? `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      `
				: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in"><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>
      `
		},
		...($session?.data?.user.role === 'adminUser'
			? [
					{
						label: 'Admin',
						href: '/app',
						icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
      `
					}
				]
			: [])
	]);

	// Badge animation state
	let count = $derived(bag.count);
	let prevCount = $state(0);
	let animateBadge = $state(false);

	$effect(() => {
		if (count > prevCount && prevCount > 0) {
			animateBadge = true;
			const timer = setTimeout(() => {
				animateBadge = false;
			}, 600);
			return () => clearTimeout(timer);
		}
		prevCount = count;
	});

	const isActive = (item: { label: string; href: string }) => {
		if (item.label === 'Wishlist') return $uiStore.wishlistDrawerOpen;
		if (item.href === '/') return page.url.pathname === '/';
		if (item.href === '/account') return page.url.pathname === '/account';
		return page.url.pathname.startsWith(item.href);
	};
</script>

<nav
	class="pb-safe fixed inset-x-0 bottom-0 z-50 h-[calc(60px+env(safe-area-inset-bottom))] border-t border-charcoal bg-void/80 px-2 pt-2 backdrop-blur-md md:hidden"
>
	<div class="flex h-full items-center justify-around">
		{#each navItems as item}
			<a
				href={item.href}
				onclick={(e) => {
					if (item.label === 'Wishlist') {
						e.preventDefault();
						toggleWishlistDrawer();
					}
				}}
				class="relative flex min-w-12 flex-1 flex-col items-center justify-center gap-1 transition-colors
          {isActive(item) ? 'text-volt' : 'text-ash hover:text-bone'}"
			>
				<div class="transition-transform duration-200 {isActive(item) ? 'scale-110' : ''}">
					{#if item.label === 'Wishlist'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill={wishlist.allIds.length > 0 ? 'var(--color-volt)' : 'none'}
							stroke={wishlist.allIds.length > 0 ? 'var(--color-volt)' : 'currentColor'}
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-heart transition-colors"
						>
							<path
								d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
							/>
						</svg>
					{:else}
						{@html item.icon}
					{/if}
				</div>
				<span class="font-mono text-[10px] tracking-wider uppercase">{item.label}</span>

				{#if item.label === 'Bag' && bag.count > 0}
					<span
						class="absolute top-0 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void transition-all duration-300"
						class:badge-bounce-anim={animateBadge}
					>
						{bag.count}
					</span>
				{/if}

				{#if item.label === 'Wishlist' && wishlist.allIds.length > 0}
					<span
						class="absolute top-0 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void transition-all duration-300"
					>
						{wishlist.allIds.length}
					</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>

<style>
	.pb-safe {
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	@keyframes badge-bounce {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.35);
			background-color: var(--color-volt);
		}
	}
	:global(.badge-bounce-anim) {
		animation: badge-bounce 0.6s ease-in-out;
	}
</style>
