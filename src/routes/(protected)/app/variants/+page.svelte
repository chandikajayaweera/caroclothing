<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Catalog"
	title="Variants"
	description="Manage SKU, size, color, swatch hex, price override, weight, sort order, and active state per variant."
	primaryAction="Add Variant"
	items={['Variant table', 'SKU validation', 'Color swatches', 'Price overrides']}
/>
