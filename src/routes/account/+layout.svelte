<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';

	let { children } = $props();

	const navLinks = [
		{ label: 'Profile', href: '/account' },
		{ label: 'Orders', href: '/account/orders' },
		{ label: 'Addresses', href: '/account/addresses' },
		{ label: 'Wishlist', href: '/account/wishlist' }
	];

	const isActive = (href: string) => page.url.pathname === href;
</script>

<div class="min-h-screen md:pt-[60px] lg:pt-16 bg-void">
	<!-- Mobile Tab Navigation -->
	<div class="lg:hidden">
		<div class="px-4 pt-6 pb-4 flex flex-col gap-1">
			<span class="font-mono text-[9px] text-ash/40 uppercase tracking-[0.2em]">Account</span>
			<h1 class="font-display text-3xl text-bone uppercase">Kasun Mendis</h1>
		</div>
		<div class="flex border-b border-charcoal overflow-x-auto no-scrollbar">
			{#each navLinks as link}
				<a
					href={link.href}
					class="flex-1 min-w-[100px] py-3 font-mono text-[10px] uppercase tracking-widest text-center transition-colors
          {isActive(link.href) ? 'text-volt border-b-2 border-volt' : 'text-ash'}"
				>
					{link.label}
				</a>
			{/each}
		</div>
	</div>

	<!-- Desktop Sidebar Navigation -->
	<div class="lg:grid lg:grid-cols-[240px_1fr] lg:min-h-[calc(100vh-64px)]">
		<aside class="hidden lg:flex flex-col bg-charcoal/30 border-r border-charcoal px-6 py-10">
			<div class="mb-10">
				<span class="font-mono text-[9px] text-ash/40 uppercase tracking-[0.2em]">Account</span>
				<h1 class="font-display text-4xl text-bone uppercase mt-1">Kasun Mendis</h1>
			</div>

			<nav class="flex flex-col gap-1">
				{#each navLinks as link}
					<a
						href={link.href}
						class="font-mono text-[10px] uppercase tracking-widest py-3 px-4 transition-colors
            {isActive(link.href) ? 'text-volt border-l-2 border-volt bg-void/20' : 'text-ash hover:text-bone hover:bg-void/10'}"
					>
						{link.label}
					</a>
				{/each}
			</nav>

			<button class="mt-auto font-mono text-[10px] text-ash/40 hover:text-ash uppercase tracking-widest text-left px-4 py-3 transition-colors">
				Sign Out
			</button>
		</aside>

		<main class="px-4 py-8 md:px-8 md:py-10 lg:px-12 lg:py-12 overflow-y-auto">
			<div class="max-w-4xl">
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
