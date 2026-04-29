<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Commerce"
	title="Payments"
	description="Review payment methods, gateway references, transaction state, refund amount, and raw gateway response."
	primaryAction="Sync Payments"
	items={['Payment table', 'Gateway status', 'Refund flow', 'Failure log']}
/>
