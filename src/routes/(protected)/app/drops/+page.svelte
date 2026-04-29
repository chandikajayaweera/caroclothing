<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Operations"
	title="Drops"
	description="Manage drop lifecycle, launch schedule, hero image, product lineup, waitlist, status, and sold-out archive."
	primaryAction="Create Drop"
	items={['Drop timeline', 'Product lineup', 'Waitlist', 'Status controls']}
/>
