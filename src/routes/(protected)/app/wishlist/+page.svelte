<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Services"
	title="Wishlist"
	description="Review saved products, demand signals, user saves, product relations, and future CRM hooks."
	primaryAction="View Signals"
	items={['Saved products', 'Demand by product', 'User saves', 'Low-stock hooks']}
/>
