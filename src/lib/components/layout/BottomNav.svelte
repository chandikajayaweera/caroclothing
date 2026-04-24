<script lang="ts">
	import { page } from '$app/state';
	import { cartCount } from '$lib/client/modules/stores/cart';
	import { authClient } from '$lib/client/modules/auth';

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
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      `
		},
		{
			label: 'Cart',
			href: '/cart',
			icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-bag"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
      `
		},
		// Conditionally spread the Wishlist item into the array if session data exists
		...($session?.data
			? [
					{
						label: 'Wishlist',
						href: '/wishlist',
						icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
      `
					}
				]
			: []),
		{
			label: 'Account',
			href: '/account',
			icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      `
		}
	]);

	const isActive = (href: string) => {
		if (href === '/') return page.url.pathname === '/';
		if (href === '/account') return page.url.pathname === '/account';
		return page.url.pathname.startsWith(href);
	};
</script>

<nav
	class="pb-safe fixed inset-x-0 bottom-0 z-50 h-[calc(60px+env(safe-area-inset-bottom))] border-t border-charcoal bg-void/80 px-2 pt-2 backdrop-blur-md md:hidden"
>
	<div class="flex h-full items-center justify-around">
		{#each navItems as item}
			<a
				href={item.href}
				class="relative flex min-w-[64px] flex-col items-center justify-center gap-1 transition-colors
          {isActive(item.href) ? 'text-volt' : 'text-ash hover:text-bone'}"
			>
				<div class="transition-transform duration-200 {isActive(item.href) ? 'scale-110' : ''}">
					{@html item.icon}
				</div>
				<span class="font-mono text-[10px] tracking-wider uppercase">{item.label}</span>

				{#if item.label === 'Cart' && $cartCount > 0}
					<span
						class="absolute top-0 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void"
					>
						{$cartCount}
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
