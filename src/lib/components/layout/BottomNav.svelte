<script lang="ts">
	import { page } from '$app/state';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';
	import { authClient } from '$lib/client/modules/auth';
	import { toggleWishlistDrawer, uiStore } from '$lib/client/modules/stores/ui';
	import {
		Home,
		Store,
		ShoppingBag,
		Heart,
		User,
		LogIn,
		LayoutDashboard
	} from 'lucide-svelte';
	import NavBadge from './NavBadge.svelte';

	const session = authClient.useSession();
	const wishlistCount = $derived(wishlist.allIds.length);

	const navItems = $derived([
		{
			label: 'Home',
			href: '/',
			icon: Home
		},
		{
			label: 'Shop',
			href: '/shop',
			icon: Store
		},
		{
			label: 'Bag',
			href: '/bag',
			icon: ShoppingBag
		},
		{
			label: 'Wishlist',
			href: '#wishlist',
			icon: Heart
		},
		{
			label: $session?.data ? 'Account' : 'Sign In',
			href: $session?.data ? '/account' : '/sign-in',
			icon: $session?.data ? User : LogIn
		},
		...($session?.data?.user.role === 'adminUser'
			? [
					{
						label: 'Admin',
						href: '/app',
						icon: LayoutDashboard
					}
				]
			: [])
	]);

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
			{@const IconComponent = item.icon}
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
					<IconComponent
						size={20}
						strokeWidth={2}
						fill={item.label === 'Wishlist' && wishlistCount > 0 ? 'var(--color-volt)' : 'none'}
						class={item.label === 'Wishlist' && wishlistCount > 0 ? 'text-volt' : ''}
					/>
				</div>
				<span class="font-mono text-[10px] tracking-wider uppercase">{item.label}</span>

				{#if item.label === 'Bag'}
					<NavBadge count={bag.count} class="top-0 right-3" />
				{/if}

				{#if item.label === 'Wishlist' && wishlistCount > 0}
					<span
						class="absolute top-0 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void transition-all duration-300"
					>
						{wishlistCount}
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
</style>
