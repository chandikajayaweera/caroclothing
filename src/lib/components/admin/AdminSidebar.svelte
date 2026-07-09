<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authClient, signOutSession } from '$lib/client/modules/auth';
	import {
		Archive,
		BadgePercent,
		Boxes,
		ClipboardList,
		CreditCard,
		Home,
		LogOut,
		Mail,
		MapPinned,
		MessageSquareText,
		Package,
		PanelLeftClose,
		PanelLeftOpen,
		ShieldCheck,
		Star,
		Store,
		Truck,
		UserRoundPen,
		UsersRound,
		X
	} from 'lucide-svelte';

	type NavHref =
		| '/app'
		| '/app/addresses'
		| '/app/bag'
		| '/app/categories'
		| '/app/inventory'
		| '/app/notifications'
		| '/app/orders'
		| '/app/payments'
		| '/app/products'
		| '/app/promotions'
		| '/app/reviews'
		| '/app/shipping'
		| '/app/users'
		| '/app/wishlist';

	type NavItem = {
		label: string;
		href: NavHref;
		icon: typeof Home;
	};

	let {
		collapsed = false,
		mobileOpen = false,
		onClose = () => {},
		onToggleCollapse = () => {}
	}: {
		collapsed?: boolean;
		mobileOpen?: boolean;
		onClose?: () => void;
		onToggleCollapse?: () => void;
	} = $props();

	const navGroups: { label: string; items: NavItem[] }[] = [
		{
			label: 'Dashboard',
			items: [{ label: 'Overview', href: '/app', icon: Home }]
		},
		{
			label: 'Commerce',
			items: [
				{ label: 'Orders', href: '/app/orders', icon: ClipboardList },
				{ label: 'Payments', href: '/app/payments', icon: CreditCard },
				{ label: 'Promotions', href: '/app/promotions', icon: BadgePercent }
			]
		},
		{
			label: 'Catalog',
			items: [
				{ label: 'Products', href: '/app/products', icon: Package },
				{ label: 'Categories', href: '/app/categories', icon: Boxes }
			]
		},
		{
			label: 'Operations',
			items: [
				{ label: 'Inventory', href: '/app/inventory', icon: Boxes },
				{ label: 'Shipping', href: '/app/shipping', icon: Truck }
			]
		},
		{
			label: 'Customers',
			items: [
				{ label: 'Users', href: '/app/users', icon: UsersRound },
				{ label: 'Addresses', href: '/app/addresses', icon: MapPinned },
				{ label: 'Reviews', href: '/app/reviews', icon: Star },
				{ label: 'Wishlist', href: '/app/wishlist', icon: MessageSquareText }
			]
		},
		{
			label: 'Services',
			items: [
				{ label: 'Notifications', href: '/app/notifications', icon: Mail },
				{ label: 'Bag', href: '/app/bag', icon: Archive }
			]
		}
	];

	const isActive = (href: string) =>
		href === '/app' ? page.url.pathname === href : page.url.pathname.startsWith(href);

	const session = authClient.useSession();
	let profileOpen = $state(false);
	let mobileProfileExpanded = $state(false);
	let profileContainer = $state<HTMLDivElement | null>(null);

	function handleWindowClick(event: MouseEvent) {
		if (!profileOpen) return;
		if (profileContainer && !profileContainer.contains(event.target as Node)) {
			profileOpen = false;
		}
	}

	const userInitials = $derived(
		($session.data?.user.name ?? $session.data?.user.email ?? 'A')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'A'
	);

	async function signOut() {
		profileOpen = false;
		const result = await signOutSession();
		if (!result.ok) {
			console.error('[auth] Failed to sign out:', result.error);
			return;
		}
		await goto(resolve('/'), { invalidateAll: true });
	}
</script>

<svelte:window onclick={handleWindowClick} />

{#if mobileOpen}
	<button
		type="button"
		class="fixed inset-0 z-70 bg-void/70 backdrop-blur-sm lg:hidden"
		aria-label="Close admin navigation"
		onclick={onClose}
	></button>
{/if}

<aside
	class="fixed inset-y-0 left-0 z-80 flex h-screen w-[280px] -translate-x-full flex-col border-r border-charcoal bg-void transition-[transform,width] duration-300 ease-in-out lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 {mobileOpen
		? 'translate-x-0'
		: ''} {collapsed
		? 'lg:w-[68px] lg:max-w-[68px] lg:min-w-[68px]'
		: 'lg:w-[260px] lg:max-w-[260px] lg:min-w-[260px]'}"
>
	<div class="shrink-0 border-b border-charcoal p-2 lg:p-3">
		<div class="mb-2 flex h-11 items-center justify-between gap-3 lg:hidden">
			<a href={resolve('/app')} class="flex min-w-0 items-center gap-3" onclick={onClose}>
				<span class="font-display text-3xl tracking-[0.2em] text-bone">CARO</span>
				<span class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Admin</span>
			</a>
			<button
				type="button"
				class="text-ash transition-colors hover:text-bone"
				aria-label="Close admin navigation"
				onclick={onClose}
			>
				<X size={20} aria-hidden="true" />
			</button>
		</div>

		<div class="hidden lg:block">
			{#if collapsed}
				<button
					type="button"
					class="grid h-11 w-full place-items-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt"
					aria-label="Expand admin navigation"
					onclick={onToggleCollapse}
				>
					<PanelLeftOpen size={18} aria-hidden="true" />
				</button>
			{:else}
				<div class="grid h-11 grid-cols-[32px_1fr_32px] items-center gap-3">
					<span></span>
					<a href={resolve('/app')} class="flex min-w-0 items-center justify-center gap-3">
						<span class="font-display text-3xl tracking-[0.2em] text-bone">CARO</span>
						<span class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Admin</span>
					</a>
					<button
						type="button"
						class="text-ash transition-colors hover:text-bone"
						aria-label="Collapse admin navigation"
						onclick={onToggleCollapse}
					>
						<PanelLeftClose size={18} aria-hidden="true" />
					</button>
				</div>
			{/if}
		</div>

		<a
			href={resolve('/')}
			class="mt-2 hidden h-11 place-items-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt lg:flex lg:items-center lg:justify-center lg:gap-2 lg:px-3"
			aria-label="View store"
			title="View store"
			onclick={onClose}
		>
			<Store size={17} aria-hidden="true" />
			{#if !collapsed}
				<span class="hidden font-mono text-[9px] tracking-widest uppercase lg:inline"
					>View Store</span
				>
			{/if}
		</a>
	</div>

	<nav class="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5">
		{#each navGroups as group (group.label)}
			<div class="mb-6">
				{#if !collapsed}
					<p class="mb-2 px-3 font-mono text-[8px] tracking-[0.2em] text-ash/40 uppercase">
						{group.label}
					</p>
				{/if}
				<div class="flex flex-col gap-1">
					{#each group.items as item (item.href)}
						{@const Icon = item.icon}
						<a
							href={resolve(item.href)}
							class="group flex h-11 items-center gap-3 border-l-2 px-3 font-mono text-[10px] tracking-widest uppercase transition-colors {isActive(
								item.href
							)
								? 'border-volt bg-charcoal/60 text-volt'
								: 'border-transparent text-ash hover:bg-charcoal/40 hover:text-bone'} {collapsed
								? 'lg:justify-center'
								: 'lg:justify-start'} cursor-pointer"
							onclick={onClose}
							aria-label={collapsed ? item.label : undefined}
							title={collapsed ? item.label : undefined}
						>
							<Icon size={18} aria-hidden="true" />
							{#if !collapsed}
								<span>{item.label}</span>
							{/if}
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</nav>

	<!-- DESKTOP USER PROFILE SECTION -->
	<div
		class="relative hidden shrink-0 border-t border-charcoal p-3 lg:block"
		bind:this={profileContainer}
	>
		<button
			type="button"
			onclick={(e) => {
				e.stopPropagation();
				profileOpen = !profileOpen;
			}}
			class="flex w-full items-center justify-center gap-3 border bg-charcoal/25 p-2 text-left transition-colors outline-none {profileOpen
				? 'border-volt bg-charcoal/40 text-volt'
				: 'border-charcoal hover:border-volt/60'} {collapsed
				? 'lg:justify-center'
				: 'lg:justify-start'}"
			aria-label="Open profile menu"
		>
			{#if $session.data?.user.image}
				<img src={$session.data.user.image} alt="" class="h-9 w-9 object-cover" />
			{:else}
				<span
					class="grid h-9 w-9 shrink-0 place-items-center border border-charcoal/50 bg-void font-mono text-[10px] text-volt"
					aria-hidden="true"
				>
					{userInitials}
				</span>
			{/if}
			{#if !collapsed}
				<div class="hidden min-w-0 lg:block">
					<p class="truncate font-mono text-[10px] tracking-widest text-bone uppercase">
						{$session.data?.user.name ?? 'Admin'}
					</p>
					<p class="mt-0.5 truncate font-mono text-[8px] tracking-[0.18em] text-ash/60 uppercase">
						Profile
					</p>
				</div>
			{/if}
		</button>

		<div
			class="absolute bottom-full left-3 z-50 mb-3 w-[min(320px,calc(100vw-68px))] border border-charcoal bg-void shadow-2xl shadow-black/50 transition-opacity outline-none lg:w-80 {profileOpen
				? 'pointer-events-auto opacity-100'
				: 'pointer-events-none opacity-0'}"
			aria-hidden={!profileOpen}
		>
			<div class="flex items-start justify-between gap-4 border-b border-charcoal p-4">
				<div class="flex min-w-0 items-center gap-3">
					{#if $session.data?.user.image}
						<img src={$session.data.user.image} alt="" class="h-11 w-11 object-cover" />
					{:else}
						<div
							class="grid h-11 w-11 shrink-0 place-items-center border border-charcoal bg-charcoal font-mono text-xs text-volt"
							aria-hidden="true"
						>
							{userInitials}
						</div>
					{/if}
					<div class="min-w-0">
						<p class="truncate font-mono text-[11px] tracking-widest text-bone uppercase">
							{$session.data?.user.name ?? 'Admin'}
						</p>
						<p class="mt-1 truncate font-mono text-[9px] tracking-widest text-ash uppercase">
							{$session.data?.user.email ?? 'Admin session'}
						</p>
					</div>
				</div>
				<button
					type="button"
					class="cursor-pointer text-ash transition-colors hover:text-bone"
					aria-label="Close profile menu"
					onclick={() => (profileOpen = false)}
				>
					<X size={16} aria-hidden="true" />
				</button>
			</div>

			<div class="p-2">
				<div class="mb-2 flex items-center gap-3 border border-charcoal bg-charcoal/30 p-3">
					<ShieldCheck size={16} class="text-volt" aria-hidden="true" />
					<div>
						<p class="font-mono text-[8px] tracking-[0.2em] text-ash/50 uppercase">Role</p>
						<p class="mt-1 font-mono text-[10px] tracking-widest text-volt uppercase">adminUser</p>
					</div>
				</div>

				<a
					href={resolve('/account')}
					class="flex h-11 cursor-pointer items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone"
					onclick={() => (profileOpen = false)}
				>
					<UserRoundPen size={16} aria-hidden="true" />
					<span>Edit Profile</span>
				</a>
				<button
					type="button"
					class="flex h-11 w-full cursor-pointer items-center gap-3 px-3 text-left font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone"
					onclick={signOut}
				>
					<LogOut size={16} aria-hidden="true" />
					<span>Logout</span>
				</button>
			</div>
		</div>
	</div>

	<!-- MOBILE USER PROFILE INLINE ACCORDION -->
	<div class="block shrink-0 border-t border-charcoal bg-charcoal/5 p-3 lg:hidden">
		<button
			type="button"
			class="flex w-full cursor-pointer items-center justify-between gap-3 border border-charcoal bg-charcoal/25 p-3 text-left transition-colors outline-none hover:border-volt"
			onclick={() => (mobileProfileExpanded = !mobileProfileExpanded)}
			aria-expanded={mobileProfileExpanded}
			aria-label="Toggle user profile options"
		>
			<div class="flex min-w-0 items-center gap-3">
				{#if $session.data?.user.image}
					<img src={$session.data.user.image} alt="" class="h-9 w-9 object-cover" />
				{:else}
					<span
						class="grid h-9 w-9 shrink-0 place-items-center border border-charcoal/50 bg-void font-mono text-[10px] text-volt"
						aria-hidden="true"
					>
						{userInitials}
					</span>
				{/if}
				<div class="min-w-0">
					<p class="truncate font-mono text-[10px] font-bold tracking-widest text-bone uppercase">
						{$session.data?.user.name ?? 'Admin'}
					</p>
					<p class="mt-0.5 truncate font-mono text-[8px] tracking-[0.18em] text-ash/60 uppercase">
						{$session.data?.user.email ?? 'Admin session'}
					</p>
				</div>
			</div>
			<span
				class="text-ash transition-transform duration-200 {mobileProfileExpanded
					? 'rotate-180'
					: ''}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg
				>
			</span>
		</button>

		{#if mobileProfileExpanded}
			<div class="mt-2 space-y-1.5 border border-charcoal bg-void p-2">
				<div class="flex items-center gap-3 border border-charcoal bg-charcoal/20 p-2.5">
					<ShieldCheck size={14} class="text-volt" aria-hidden="true" />
					<div>
						<p class="font-mono text-[8px] tracking-[0.2em] text-ash/50 uppercase">Role</p>
						<p class="mt-0.5 font-mono text-[9px] tracking-widest text-volt uppercase">adminUser</p>
					</div>
				</div>

				<a
					href={resolve('/account')}
					class="flex h-10 cursor-pointer items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone"
					onclick={onClose}
				>
					<UserRoundPen size={14} aria-hidden="true" />
					<span>Edit Profile</span>
				</a>

				<button
					type="button"
					class="flex h-10 w-full cursor-pointer items-center gap-3 px-3 text-left font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone"
					onclick={signOut}
				>
					<LogOut size={14} aria-hidden="true" />
					<span>Logout</span>
				</button>
			</div>
		{/if}
	</div>
</aside>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
