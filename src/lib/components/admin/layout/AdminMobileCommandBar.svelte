<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Menu, Store } from 'lucide-svelte';
	import { getAdminPageLabel } from '$lib/components/admin/sidebar/admin-nav';

	let { onOpenSidebar = () => {} }: { onOpenSidebar?: () => void } = $props();

	const pageTitle = $derived(getAdminPageLabel(page.url.pathname));
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

		<p
			class="min-w-0 flex-1 truncate text-center font-display text-xl tracking-wider text-bone uppercase"
		>
			{pageTitle}
		</p>

		<a
			href={resolve('/')}
			class="grid h-11 w-11 cursor-pointer place-items-center border border-charcoal bg-charcoal/25 text-ash transition-colors hover:border-volt hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
			aria-label="Visit store"
			title="Visit store"
		>
			<Store size={18} aria-hidden="true" />
		</a>
	</div>
</header>
