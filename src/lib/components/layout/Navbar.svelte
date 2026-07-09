<script lang="ts">
	import { onMount } from 'svelte';
	import { toggleBagDrawer, toggleWishlistDrawer } from '$lib/client/modules/stores/ui';
	import { bag } from '$lib/client/modules/stores/bag.svelte';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';
	import { page } from '$app/state';
	import { authClient } from '$lib/client/modules/auth';
	import { Heart, ShoppingBag, User, LogIn, LayoutDashboard } from 'lucide-svelte';
	import NavBadge from './NavBadge.svelte';

	const session = authClient.useSession();
	let scrolled = $state(false);
	const isAdminUser = $derived($session.data?.user.role === 'adminUser');
	const wishlistCount = $derived(wishlist.allIds.length);

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
			<!-- Wishlist (Tablet/Desktop) -->
			<button
				class="relative hidden cursor-pointer text-bone transition-colors hover:text-volt md:block"
				onclick={() => {
					toggleWishlistDrawer();
				}}
				aria-label="Wishlist"
			>
				<Heart
					size={20}
					strokeWidth={2}
					fill={wishlistCount > 0 ? 'var(--color-volt)' : 'none'}
					class="transition-colors {wishlistCount > 0 ? 'text-volt' : ''}"
				/>
				{#if wishlistCount > 0}
					<span
						class="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void"
					>
						{wishlistCount}
					</span>
				{/if}
			</button>

			<!-- Bag (Desktop only) -->
			<button
				class="relative hidden text-bone transition-colors hover:text-volt md:block"
				onclick={() => {
					toggleBagDrawer();
				}}
				aria-label="Bag"
			>
				<ShoppingBag size={20} strokeWidth={2} />
				<NavBadge count={bag.count} class="-top-1.5 -right-1.5" />
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
					<User size={20} strokeWidth={2} />
				{:else}
					<LogIn size={20} strokeWidth={2} />
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
