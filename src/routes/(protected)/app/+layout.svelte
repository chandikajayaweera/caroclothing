<script lang="ts">
	import { navigating } from '$app/state';
	import AdminMobileCommandBar from '$lib/components/admin/layout/AdminMobileCommandBar.svelte';
	import AdminSidebar from '$lib/components/admin/sidebar/AdminSidebar.svelte';

	let { children } = $props();

	let sidebarCollapsed = $state(false);
	let mobileSidebarOpen = $state(false);

	const sidebarWidth = $derived(sidebarCollapsed ? '68px minmax(0, 1fr)' : '260px minmax(0, 1fr)');
</script>

<div
	data-admin-shell
	data-sveltekit-preload-data="tap"
	class="h-dvh min-h-0 overflow-y-hidden bg-void text-bone transition-[grid-template-columns] duration-300 ease-in-out lg:grid lg:grid-cols-(--admin-sidebar-width)"
	style="--admin-sidebar-width: {sidebarWidth};"
	aria-busy={navigating.to !== null}
>
	{#if navigating.to}
		<div
			class="fixed inset-x-0 top-0 z-100 h-[3px] overflow-hidden bg-void"
			role="progressbar"
			aria-label="Loading admin page"
		>
			<div class="h-full w-1/2 animate-pulse bg-volt"></div>
		</div>
	{/if}
	<AdminSidebar
		collapsed={sidebarCollapsed}
		bind:mobileOpen={mobileSidebarOpen}
		onClose={() => (mobileSidebarOpen = false)}
		onToggleCollapse={() => (sidebarCollapsed = !sidebarCollapsed)}
	/>

	<div class="flex h-full min-h-0 min-w-0 flex-col">
		<AdminMobileCommandBar onOpenSidebar={() => (mobileSidebarOpen = true)} />

		<main
			data-admin-main
			class="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain px-2.5 pt-6 pb-10 sm:px-4 md:px-6 md:pt-8 lg:px-8"
		>
			{@render children()}
		</main>
	</div>
</div>

<style>
	@media print {
		:global([data-admin-sidebar]),
		:global([data-admin-mobile-bar]) {
			display: none !important;
		}

		:global([data-admin-shell]) {
			display: block !important;
			height: auto !important;
			overflow: visible !important;
			background: white !important;
		}

		:global([data-admin-main]) {
			height: auto !important;
			overflow: visible !important;
			padding: 0 !important;
		}
	}
</style>
