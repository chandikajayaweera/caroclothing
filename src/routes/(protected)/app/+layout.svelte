<script lang="ts">
	import AdminMobileCommandBar from '$lib/components/admin/AdminMobileCommandBar.svelte';
	import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';

	let { children } = $props();

	let sidebarCollapsed = $state(false);
	let mobileSidebarOpen = $state(false);

	const sidebarWidth = $derived(sidebarCollapsed ? '88px minmax(0, 1fr)' : '260px minmax(0, 1fr)');
</script>

<div
	class="min-h-screen bg-void text-bone lg:grid lg:h-screen lg:grid-cols-(--admin-sidebar-width) lg:overflow-hidden"
	style="--admin-sidebar-width: {sidebarWidth};"
>
	<AdminSidebar
		collapsed={sidebarCollapsed}
		mobileOpen={mobileSidebarOpen}
		onClose={() => (mobileSidebarOpen = false)}
		onToggleCollapse={() => (sidebarCollapsed = !sidebarCollapsed)}
	/>

	<div class="flex min-w-0 flex-col lg:h-screen lg:min-h-0">
		<AdminMobileCommandBar onOpenSidebar={() => (mobileSidebarOpen = true)} />

		<main
			class="min-h-0 flex-1 overflow-x-hidden overscroll-contain px-4 pt-6 pb-10 md:px-6 md:pt-8 lg:overflow-y-auto lg:px-8"
		>
			{@render children()}
		</main>
	</div>
</div>
