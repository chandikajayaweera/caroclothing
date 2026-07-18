<script lang="ts">
	import { onMount } from 'svelte';
	import { toggleBagDrawer, toggleWishlistDrawer } from '$lib/client/stores/ui';
	import { bag } from '$lib/client/stores/bag.svelte';
	import { wishlist } from '$lib/client/stores/wishlist.svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/client/auth';
	import { Heart, ShoppingBag, User, LogIn, LayoutDashboard } from 'lucide-svelte';
	import NavBadge from './NavBadge.svelte';

	const session = authClient.useSession();
	let scrolled = $state(false);
	const isSignedIn = $derived(Boolean($session.data));
	const isAdminUser = $derived($session.data?.user.role === 'adminUser');
	const wishlistCount = $derived(wishlist.allIds.length);
	const accountHref = $derived(isSignedIn ? '/account' : '/sign-in');
	const accountLabel = $derived(isSignedIn ? 'Account' : 'Sign in');
	const AccountIcon = $derived(isSignedIn ? User : LogIn);

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
			<a href={resolve('/')}>
				<span class="font-display text-3xl tracking-[0.2em] text-bone">CARO</span>
			</a>
		</div>

		<!-- Center: Logo (Mobile/Tablet) / Nav Links (Desktop) -->
		<div class="absolute left-1/2 -translate-x-1/2 lg:hidden">
			<a href={resolve('/')}>
				<span class="font-display text-2xl tracking-[0.2em] text-bone md:text-3xl">CARO</span>
			</a>
		</div>

		<div class="hidden items-center gap-8 lg:flex">
			{#each navLinks as link (link.href)}
				<a
					href={resolve(link.href as '/')}
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
				<span
					class="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void transition-opacity {wishlistCount >
					0
						? 'opacity-100'
						: 'opacity-0'}"
					aria-hidden={wishlistCount === 0}
				>
					{wishlistCount}
				</span>
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
				href={resolve(accountHref as '/')}
				class="hidden transition-colors md:block {isActive(accountHref)
					? 'text-volt'
					: 'text-bone hover:text-volt'}"
				aria-label={accountLabel}
			>
				<AccountIcon size={20} strokeWidth={2} />
			</a>
			<a
				href={resolve('/app')}
				class="relative hidden transition-colors {isAdminUser ? 'md:block' : 'md:hidden'} {isActive(
					'/app'
				)
					? 'text-volt'
					: 'text-bone hover:text-volt'}"
				aria-label="Admin dashboard"
				aria-hidden={!isAdminUser}
				tabindex={isAdminUser ? undefined : -1}
			>
				<LayoutDashboard size={20} strokeWidth={2} />
			</a>
		</div>
	</div>
</nav>
