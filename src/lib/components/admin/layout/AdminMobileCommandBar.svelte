<script lang="ts">
	import { resolve } from '$app/paths';
	import { Menu } from 'lucide-svelte';
	import { authClient } from '$lib/client/auth';

	let { onOpenSidebar = () => {} }: { onOpenSidebar?: () => void } = $props();

	const session = authClient.useSession();
	const userInitials = $derived(
		($session.data?.user.name ?? $session.data?.user.email ?? 'A')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'A'
	);
</script>

<header
	data-admin-mobile-bar
	class="sticky top-0 z-40 border-b border-charcoal bg-void lg:hidden"
	style="padding-top: env(safe-area-inset-top);"
>
	<div class="flex h-14 items-center justify-between gap-3 px-4">
		<button
			type="button"
			class="grid h-11 w-11 cursor-pointer place-items-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
			aria-label="Open admin navigation"
			onclick={onOpenSidebar}
		>
			<Menu size={18} aria-hidden="true" />
		</button>

		<a href={resolve('/app')} class="font-display text-2xl tracking-[0.2em] text-bone">CARO</a>

		<a
			href={resolve('/account')}
			class="grid h-11 w-11 cursor-pointer place-items-center overflow-hidden border border-charcoal bg-charcoal/25 text-volt transition-colors hover:border-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
			aria-label="Open account"
			title="Account"
		>
			{#if $session.data?.user.image}
				<img src={$session.data.user.image} alt="" class="h-8 w-8 object-cover" />
			{:else}
				<span class="font-mono text-[10px] font-bold" aria-hidden="true">{userInitials}</span>
			{/if}
		</a>
	</div>
</header>
