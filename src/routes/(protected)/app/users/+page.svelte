<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Customers"
	title="Users"
	description="Manage customer and admin users, roles, phone number, Google account links, ban state, and sessions."
	primaryAction="Invite Admin"
	items={['User table', 'Role controls', 'Ban controls', 'Linked accounts']}
/>
