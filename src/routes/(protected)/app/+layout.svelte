<script lang="ts">
	import AdminMobileCommandBar from '$lib/components/admin/AdminMobileCommandBar.svelte';
	import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';

	let { children } = $props();

	let sidebarCollapsed = $state(false);
	let mobileSidebarOpen = $state(false);

	const sidebarWidth = $derived(sidebarCollapsed ? '88px minmax(0, 1fr)' : '260px minmax(0, 1fr)');
</script>

<div
	class="h-dvh min-h-0 overflow-hidden bg-void text-bone lg:grid lg:grid-cols-(--admin-sidebar-width)"
	style="--admin-sidebar-width: {sidebarWidth};"
>
	<AdminSidebar
		collapsed={sidebarCollapsed}
		mobileOpen={mobileSidebarOpen}
		onClose={() => (mobileSidebarOpen = false)}
		onToggleCollapse={() => (sidebarCollapsed = !sidebarCollapsed)}
	/>

	<div class="flex h-full min-h-0 min-w-0 flex-col">
		<AdminMobileCommandBar onOpenSidebar={() => (mobileSidebarOpen = true)} />

		<main
			class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-6 pb-10 md:px-6 md:pt-8 lg:px-8"
		>
			{@render children()}
		</main>
	</div>
</div>
