<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Admin dashboard"
	title="Overview"
	description="High-level control room for orders, stock, drops, catalog, customers, and service settings."
	primaryAction="Review Ops"
	items={[
		'Add live metrics',
		'Surface urgent orders',
		'Show low-stock alerts',
		'Track drop readiness'
	]}
/>
