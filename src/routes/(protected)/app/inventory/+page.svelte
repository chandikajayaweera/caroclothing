<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Operations"
	title="Inventory"
	description="Track quantity, reserved stock, available stock, low-stock thresholds, backorder state, and stock movements."
	primaryAction="Adjust Stock"
	items={['Low-stock queue', 'Movement log', 'Reservation view', 'Backorder controls']}
/>
