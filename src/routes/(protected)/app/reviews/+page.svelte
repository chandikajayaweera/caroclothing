<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Customers"
	title="Reviews"
	description="Moderate reviews, approve public display, check verified purchase state, rating, media, and admin notes."
	primaryAction="Moderate"
	items={['Approval queue', 'Verified badge', 'Media review', 'Admin notes']}
/>
