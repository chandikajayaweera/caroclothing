<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Commerce"
	title="Orders"
	description="Manage order status, address snapshots, tracking data, customer notes, admin notes, and status history."
	primaryAction="Create Order"
	items={['Order table', 'Status filters', 'Tracking editor', 'Audit timeline']}
/>
