<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/client/modules/auth';
	let { children } = $props();

	const navLinks = [
		{ label: 'Profile', href: '/account' },
		{ label: 'Orders', href: '/account/orders' },
		{ label: 'Addresses', href: '/account/addresses' }
	];

	const isActive = (href: string) => page.url.pathname === href;

	async function signOut() {
		await authClient.signOut();
		goto('/', { invalidateAll: true });
	}

	const session = authClient.useSession();
</script>

<div class="min-h-screen bg-void md:pt-[60px] lg:pt-16">
	<!-- Mobile Tab Navigation -->
	<div class="lg:hidden">
		<div class="flex flex-col gap-1 px-4 pt-6 pb-4">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash/40 uppercase">Account</span>
			<h1 class="font-display text-3xl text-bone uppercase">{$session.data?.user.name}</h1>
		</div>
		<div class="no-scrollbar flex overflow-x-auto border-b border-charcoal">
			{#each navLinks as link}
				<a
					href={link.href}
					class="min-w-[100px] flex-1 py-3 text-center font-mono text-[10px] tracking-widest uppercase transition-colors
          {isActive(link.href) ? 'border-b-2 border-volt text-volt' : 'text-ash'}"
				>
					{link.label}
				</a>
			{/each}
		</div>
	</div>

	<!-- Desktop Sidebar Navigation -->
	<div class="lg:grid lg:min-h-[calc(100vh-64px)] lg:grid-cols-[240px_1fr]">
		<aside class="hidden flex-col border-r border-charcoal bg-charcoal/30 px-6 py-10 lg:flex">
			<div class="mb-10">
				<span class="font-mono text-[9px] tracking-[0.2em] text-ash/40 uppercase">Account</span>
				<h1 class="mt-1 font-display text-4xl text-bone uppercase">{$session.data?.user.name}</h1>
			</div>

			<nav class="flex flex-col gap-1">
				{#each navLinks as link}
					<a
						href={link.href}
						class="px-4 py-3 font-mono text-[10px] tracking-widest uppercase transition-colors
            {isActive(link.href)
							? 'border-l-2 border-volt bg-void/20 text-volt'
							: 'text-ash hover:bg-void/10 hover:text-bone'}"
					>
						{link.label}
					</a>
				{/each}
			</nav>

			<button
				onclick={signOut}
				class="mt-auto px-4 py-3 text-left font-mono text-[10px] tracking-widest text-ash/40 uppercase transition-colors hover:text-ash"
			>
				Sign Out
			</button>
		</aside>

		<main class="overflow-y-auto px-4 py-8 md:px-8 md:py-10 lg:px-12 lg:py-12">
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
