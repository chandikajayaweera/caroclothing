<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { signOutSession } from '$lib/client/modules/auth';
	import { BookOpen, Heart, House, LogOut, MapPin, Package, ShieldCheck } from 'lucide-svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const navLinks = [
		{ label: 'Overview', href: '/account', icon: House },
		{ label: 'Orders', href: '/account/orders', icon: Package },
		{ label: 'Addresses', href: '/account/addresses', icon: MapPin },
		{ label: 'Wishlist', href: '/account/wishlist', icon: Heart },
		{ label: 'Reviews', href: '/account/reviews', icon: BookOpen },
		{ label: 'Security', href: '/account/security', icon: ShieldCheck }
	] as const;

	function isActive(href: string): boolean {
		return href === '/account'
			? page.url.pathname === href
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	async function signOut() {
		const result = await signOutSession();
		if (!result.ok) {
			console.error('[auth] Failed to sign out:', result.error);
			return;
		}
		await goto(resolve('/'), { invalidateAll: true });
	}
</script>

<div class="min-h-screen bg-void text-bone md:pt-[60px] lg:pt-16">
	<header class="border-b border-charcoal px-4 pt-6 lg:hidden">
		<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">My Caro</p>
		<h1 class="mt-1 font-display text-3xl uppercase">
			{data.account.needsNameCompletion ? 'Complete your profile' : data.account.name}
		</h1>
		<nav
			class="no-scrollbar mt-5 flex snap-x gap-1 overflow-x-auto sm:grid sm:grid-cols-3 sm:overflow-visible"
			aria-label="Account navigation"
		>
			{#each navLinks as link (link.href)}
				<a
					href={resolve(link.href)}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="flex min-h-11 shrink-0 snap-start items-center justify-center gap-2 border-b-2 px-3 font-mono text-[9px] tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt {isActive(
						link.href
					)
						? 'border-volt text-volt'
						: 'border-transparent text-ash hover:text-bone'}"
				>
					<link.icon size={14} aria-hidden="true" />
					{link.label}
				</a>
			{/each}
		</nav>
	</header>

	<div class="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1440px] lg:grid-cols-[260px_1fr]">
		<aside class="hidden border-r border-charcoal px-6 py-10 lg:flex lg:flex-col">
			<div class="mb-8 border-b border-charcoal pb-8">
				<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">My Caro</p>
				<h1 class="mt-2 font-display text-4xl leading-none uppercase">
					{data.account.needsNameCompletion ? 'Profile pending' : data.account.name}
				</h1>
				<p class="mt-3 truncate font-mono text-[9px] text-ash">
					{data.account.email ?? data.account.phoneNumber ?? 'Account'}
				</p>
			</div>

			<nav class="flex flex-col gap-1" aria-label="Account navigation">
				{#each navLinks as link (link.href)}
					<a
						href={resolve(link.href)}
						aria-current={isActive(link.href) ? 'page' : undefined}
						class="flex min-h-11 items-center gap-3 border-l-2 px-4 font-mono text-[10px] tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt {isActive(
							link.href
						)
							? 'border-volt bg-charcoal/50 text-volt'
							: 'border-transparent text-ash hover:bg-charcoal/30 hover:text-bone'}"
					>
						<link.icon size={15} aria-hidden="true" />
						{link.label}
					</a>
				{/each}
			</nav>

			<button
				type="button"
				onclick={signOut}
				class="mt-auto flex min-h-11 cursor-pointer items-center gap-3 px-4 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
			>
				<LogOut size={15} aria-hidden="true" />
				Sign out
			</button>
		</aside>

		<main class="min-w-0 px-4 py-8 sm:px-6 md:px-8 md:py-10 lg:px-12 lg:py-12">
			<div class="mx-auto max-w-5xl">
				{@render children()}
			</div>
		</main>
	</div>
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
