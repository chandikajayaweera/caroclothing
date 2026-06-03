<script lang="ts">
	import { resolve } from '$app/paths';
	import { Menu, Store } from 'lucide-svelte';

	let { onOpenSidebar = () => {} }: { onOpenSidebar?: () => void } = $props();
</script>

<header class="sticky top-0 z-40 border-b border-charcoal/60 bg-void/80 backdrop-blur-md lg:hidden">
	<div class="flex h-14 items-center justify-between gap-3 px-4">
		<button
			type="button"
			class="grid h-10 w-10 cursor-pointer place-items-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt"
			aria-label="Open admin navigation"
			onclick={onOpenSidebar}
		>
			<Menu size={18} aria-hidden="true" />
		</button>

		<a href={resolve('/app')} class="font-display text-2xl tracking-[0.2em] text-bone">CARO</a>

		<a
			href={resolve('/')}
			class="grid h-10 w-10 cursor-pointer place-items-center border border-charcoal bg-charcoal/25 text-ash transition-colors hover:border-volt hover:text-volt"
			aria-label="View store"
			title="View store"
		>
			<Store size={18} aria-hidden="true" />
		</a>
	</div>
</header>
