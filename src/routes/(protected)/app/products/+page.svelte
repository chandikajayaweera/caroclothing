<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Catalog"
	title="Products"
	description="Manage core and drop products, product tier, price, category, flags, descriptions, SEO, and launch readiness."
	primaryAction="Add Product"
	items={['Product grid', 'Tier filters', 'SEO panel', 'Publish controls']}
/>
