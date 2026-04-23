<script lang="ts">
	import { onMount } from 'svelte';
	import { toggleCartDrawer } from '$lib/stores/ui';
	import { cartCount } from '$lib/stores/cart';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let scrolled = $state(false);

	const navLinks = [
		{ label: 'Shop', href: '/shop' },
		{ label: 'New In', href: '/shop?sort=new' },
		{ label: 'Men', href: '/shop?gender=men' },
		{ label: 'Women', href: '/shop?gender=women' },
		{ label: 'About', href: '/about' }
	];

	onMount(() => {
		const handleScroll = () => {
			scrolled = window.scrollY > 20;
		};
		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});

	const isActive = (href: string) => {
		if (href === '/account') return page.url.pathname === '/account';
		return page.url.pathname + page.url.search === href;
	};
</script>

<nav
	class="hidden md:block fixed top-0 inset-x-0 z-50 h-14 md:h-[60px] lg:h-16 border-b border-charcoal transition-colors duration-300
  {scrolled ? 'bg-void/90 backdrop-blur-md' : 'bg-void'}"
>
	<!-- Mobile / Tablet / Desktop Container -->
	<div class="h-full flex items-center justify-between px-4 md:px-6 lg:px-8">
		<!-- Left: Logo (Desktop) -->
		<div class="hidden lg:block">
			<a href="/">
				<span class="font-display text-3xl text-bone tracking-[0.2em]">CARO</span>
			</a>
		</div>

		<!-- Center: Logo (Mobile/Tablet) / Nav Links (Desktop) -->
		<div class="lg:hidden absolute left-1/2 -translate-x-1/2">
			<a href="/">
				<span class="font-display text-2xl md:text-3xl text-bone tracking-[0.2em]">CARO</span>
			</a>
		</div>

		<div class="hidden lg:flex items-center gap-8">
			{#each navLinks as link}
				<a
					href={link.href}
					class="font-mono text-[10px] lg:text-xs uppercase tracking-[0.15em] transition-colors
          {isActive(link.href) ? 'text-volt border-b border-volt pb-px' : 'text-ash hover:text-bone'}"
				>
					{link.label}
				</a>
			{/each}
		</div>

		<!-- Right: Icons -->
		<div class="flex items-center gap-4 md:gap-6">
			<!-- Search (Desktop only) -->
			<button class="hidden lg:block text-bone hover:text-volt transition-colors" aria-label="Search">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-search"
				>
					<circle cx="11" cy="11" r="8" />
					<path d="m21 21-4.3-4.3" />
				</svg>
			</button>

			<!-- Wishlist (Tablet/Desktop) -->
			<a
				href="/account/wishlist"
				class="hidden md:block transition-colors relative {isActive('/account/wishlist') ? 'text-volt' : 'text-bone hover:text-volt'}"
				aria-label="Wishlist"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-heart"
				>
					<path
						d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
					/>
				</svg>
			</a>

			<!-- Account (Tablet/Desktop) -->
			<a
				href="/account"
				class="hidden md:block transition-colors {isActive('/account') ? 'text-volt' : 'text-bone hover:text-volt'}"
				aria-label="Account"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-user"
				>
					<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
					<circle cx="12" cy="7" r="4" />
				</svg>
			</a>

			<!-- Cart (Desktop only) -->
			<button
				class="hidden md:block text-bone hover:text-volt transition-colors relative"
				onclick={() => {
					toggleCartDrawer();
				}}
				aria-label="Cart"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-shopping-bag"
				>
					<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
					<path d="M3 6h18" />
					<path d="M16 10a4 4 0 0 1-8 0" />
				</svg>
				{#if $cartCount > 0}
					<span
						class="absolute -top-1.5 -right-1.5 bg-volt text-void font-mono text-[9px] leading-none w-4 h-4 rounded-full flex items-center justify-center"
					>
						{$cartCount}
					</span>
				{/if}
			</button>
		</div>
	</div>
</nav>
