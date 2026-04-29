<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Customers"
	title="Addresses"
	description="Review saved and guest checkout addresses with Sri Lankan district validation, recipient data, and defaults."
	primaryAction="Review Addresses"
	items={['District filters', 'Default address', 'Guest records', 'Delivery issues']}
/>
