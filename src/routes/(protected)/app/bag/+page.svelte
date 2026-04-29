<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Services"
	title="Bag"
	description="Inspect guest and user bags, session ownership, item rows, expiry behavior, merge state, and locked unit prices."
	primaryAction="Inspect Bags"
	items={['Guest bags', 'User bags', 'Expiry cleanup', 'Merge conflicts']}
/>
