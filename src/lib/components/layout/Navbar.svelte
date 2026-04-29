<script lang="ts">
	import { onMount } from 'svelte';
	import { toggleCartDrawer } from '$lib/client/modules/stores/ui';
	import { cartCount } from '$lib/client/modules/stores/cart';
	import { page } from '$app/state';
	import { authClient } from '$lib/client/modules/auth';
	import { LayoutDashboard } from 'lucide-svelte';

	const session = authClient.useSession();
	let scrolled = $state(false);
	const isAdminUser = $derived($session.data?.user.role === 'adminUser');

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
		const { pathname, searchParams } = page.url;

		if (href === '/') return pathname === '/';

		if (href.startsWith('/shop')) {
			if (href === '/shop?sort=new') {
				return pathname === '/shop' && searchParams.get('sort') === 'new';
			}

			return (
				pathname === '/shop' &&
				searchParams.get('sort') !== 'new' &&
				(href === '/shop' ||
					searchParams.get('gender') === new URL(href, 'http://x').searchParams.get('gender'))
			);
		}

		return pathname.startsWith(href);
	};
</script>

<nav
	class="fixed inset-x-0 top-0 z-50 hidden h-14 border-b border-charcoal transition-colors duration-300 md:block md:h-[60px] lg:h-16
  {scrolled ? 'bg-void/90 backdrop-blur-md' : 'bg-void'}"
>
	<!-- Mobile / Tablet / Desktop Container -->
	<div class="flex h-full items-center justify-between px-4 md:px-6 lg:px-8">
		<!-- Left: Logo (Desktop) -->
		<div class="hidden lg:block">
			<a href="/">
				<span class="font-display text-3xl tracking-[0.2em] text-bone">CARO</span>
			</a>
		</div>

		<!-- Center: Logo (Mobile/Tablet) / Nav Links (Desktop) -->
		<div class="absolute left-1/2 -translate-x-1/2 lg:hidden">
			<a href="/">
				<span class="font-display text-2xl tracking-[0.2em] text-bone md:text-3xl">CARO</span>
			</a>
		</div>

		<div class="hidden items-center gap-8 lg:flex">
			{#each navLinks as link}
				<a
					href={link.href}
					class="font-mono text-[10px] tracking-[0.15em] uppercase transition-colors lg:text-xs
          {isActive(link.href)
						? 'border-b border-volt pb-px text-volt'
						: 'text-ash hover:text-bone'}"
				>
					{link.label}
				</a>
			{/each}
		</div>

		<!-- Right: Icons -->
		<div class="flex items-center gap-4 md:gap-6">
			<!-- Wishlist (Tablet/Desktop) - Auth Only -->
			{#if $session.data}
				<a
					href="/wishlist"
					class="relative hidden transition-colors md:block {isActive('/wishlist')
						? 'text-volt'
						: 'text-bone hover:text-volt'}"
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
			{/if}

			<!-- Bag (Desktop only) -->
			<button
				class="relative hidden text-bone transition-colors hover:text-volt md:block"
				onclick={() => {
					toggleCartDrawer();
				}}
				aria-label="Bag"
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
						class="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void"
					>
						{$cartCount}
					</span>
				{/if}
			</button>

			<!-- Account / Sign In (Tablet/Desktop) -->
			<a
				href={$session.data ? '/account' : '/sign-in'}
				class="hidden transition-colors md:block {isActive($session.data ? '/account' : '/sign-in')
					? 'text-volt'
					: 'text-bone hover:text-volt'}"
				aria-label={$session.data ? 'Account' : 'Sign in'}
			>
				{#if $session.data}
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
				{:else}
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
						class="lucide lucide-log-in"
					>
						<path d="m10 17 5-5-5-5" />
						<path d="M15 12H3" />
						<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
					</svg>
				{/if}
			</a>
			{#if $session.data}
				{#if isAdminUser}
					<a
						href="/app"
						class="relative hidden transition-colors md:block {isActive('/app')
							? 'text-volt'
							: 'text-bone hover:text-volt'}"
						aria-label="Admin dashboard"
					>
						<LayoutDashboard size={20} strokeWidth={2} />
					</a>
				{/if}
			{/if}
		</div>
	</div>
</nav>
