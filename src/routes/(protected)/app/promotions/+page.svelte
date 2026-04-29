<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Commerce"
	title="Promotions"
	description="Manage promo codes, usage limits, minimum order value, per-user limits, expiry windows, and redemption logs."
	primaryAction="Create Code"
	items={['Code table', 'Usage count', 'Expiry state', 'Redemption audit']}
/>
