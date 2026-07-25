<script lang="ts">
	import { resolve } from '$app/paths';
	import { PanelLeftClose, PanelLeftOpen, Store } from 'lucide-svelte';
	import AdminDrawer from '../overlays/AdminDrawer.svelte';
	import AdminSidebarNav from './AdminSidebarNav.svelte';
	import AdminSidebarProfile from './AdminSidebarProfile.svelte';
	import AdminSidebarMobileProfile from './AdminSidebarMobileProfile.svelte';

	let {
		collapsed = false,
		mobileOpen = $bindable(false),
		onClose = () => {},
		onToggleCollapse = () => {}
	}: {
		collapsed?: boolean;
		mobileOpen?: boolean;
		onClose?: () => void;
		onToggleCollapse?: () => void;
	} = $props();
</script>

<div class="lg:hidden">
	<AdminDrawer
		bind:open={mobileOpen}
		title="CARO"
		kicker="Admin navigation"
		description="Admin sections and account controls"
		side="left"
		size="sm"
		bodyClass="flex flex-col p-0 sm:p-0"
		panelClass="max-w-[300px] bg-void"
		onOpenChange={(open) => {
			if (!open) onClose();
		}}
	>
		<a
			href={resolve('/')}
			class="mx-3 mt-3 flex min-h-11 shrink-0 items-center justify-center gap-2 border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
			onclick={onClose}
		>
			<Store size={17} aria-hidden="true" />
			<span class="font-mono text-[9px] tracking-widest uppercase">View Store</span>
		</a>

		<AdminSidebarNav collapsed={false} {onClose} />
		<AdminSidebarMobileProfile {onClose} />
	</AdminDrawer>
</div>

<aside
	data-admin-sidebar
	class="hidden h-dvh flex-col border-r border-charcoal bg-void transition-[width] duration-300 ease-in-out lg:sticky lg:top-0 lg:flex {collapsed
		? 'w-[68px] max-w-[68px] min-w-[68px]'
		: 'w-[260px] max-w-[260px] min-w-[260px]'}"
>
	<div class="shrink-0 border-b border-charcoal p-3">
		{#if collapsed}
			<button
				type="button"
				class="grid h-11 w-full place-items-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
				aria-label="Expand admin navigation"
				onclick={onToggleCollapse}
			>
				<PanelLeftOpen size={18} aria-hidden="true" />
			</button>
		{:else}
			<div class="grid h-11 grid-cols-[32px_1fr_44px] items-center gap-1">
				<span aria-hidden="true"></span>
				<a href={resolve('/app')} class="flex min-w-0 items-center justify-center gap-3">
					<span class="font-display text-3xl tracking-[0.2em] text-bone">CARO</span>
					<span class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Admin</span>
				</a>
				<button
					type="button"
					class="grid h-11 w-11 place-items-center text-ash transition-colors hover:text-bone focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
					aria-label="Collapse admin navigation"
					onclick={onToggleCollapse}
				>
					<PanelLeftClose size={18} aria-hidden="true" />
				</button>
			</div>
		{/if}

		<a
			href={resolve('/')}
			class="mt-2 flex h-11 items-center justify-center gap-2 border border-charcoal px-3 text-ash transition-colors hover:border-volt hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
			aria-label="View store"
			title="View store"
		>
			<Store size={17} aria-hidden="true" />
			{#if !collapsed}
				<span class="font-mono text-[9px] tracking-widest uppercase">View Store</span>
			{/if}
		</a>
	</div>

	<AdminSidebarNav {collapsed} {onClose} />
	<AdminSidebarProfile {collapsed} />
</aside>
