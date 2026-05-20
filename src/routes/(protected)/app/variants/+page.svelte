<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Catalog"
	title="Variants"
	description="Manage size, color, swatch hex, price override, sort order, and active state per variant."
	primaryAction="Add Variant"
	items={['Variant table', 'Color swatches', 'Price overrides', 'Sort order']}
/>
