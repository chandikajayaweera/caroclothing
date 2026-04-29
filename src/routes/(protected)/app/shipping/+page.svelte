<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Operations"
	title="Shipping"
	description="Manage shipping methods, carriers, base prices, free-shipping thresholds, delivery estimates, and district zones."
	primaryAction="Add Method"
	items={['Method table', 'District zones', 'Delivery windows', 'Free threshold']}
/>
