<script lang="ts">
	import { resolve } from '$app/paths';
	import { ShieldCheck } from 'lucide-svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="min-h-screen bg-void text-bone selection:bg-volt selection:text-void">
	<header class="border-b border-charcoal">
		<div class="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 lg:px-8">
			<a
				href={resolve('/')}
				aria-label="Caro Clothing home"
				class="font-display text-3xl tracking-[0.2em] text-bone"
			>
				CARO
			</a>
			<div
				class="flex items-center gap-2 font-mono text-[9px] tracking-[0.16em] text-ash uppercase"
			>
				<ShieldCheck size={15} class="text-volt" aria-hidden="true" />
				Secure checkout
			</div>
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>
