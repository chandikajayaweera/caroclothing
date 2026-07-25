<script lang="ts">
	import { page } from '$app/state';
	import AdminErrorState from '$lib/components/admin/data-display/AdminErrorState.svelte';
	import AdminPageHeader from '$lib/components/admin/layout/AdminPageHeader.svelte';
	import AdminPageShell from '$lib/components/admin/layout/AdminPageShell.svelte';

	const description = $derived(
		page.status >= 500
			? 'An unexpected admin request failed. Retry once; if it persists, check worker logs.'
			: (page.error?.message ?? 'This admin view is unavailable.')
	);
</script>

<svelte:head>
	<title>Admin error | Caro Admin</title>
</svelte:head>

<AdminPageShell size="normal" spacing="compact">
	<AdminPageHeader kicker={`Error ${page.status}`} title="Admin request failed" />
	<AdminErrorState
		title={page.status === 404 ? 'Admin view not found' : 'Unable to complete request'}
		{description}
		backHref="/app"
		backLabel="Dashboard"
		onretry={() => window.location.reload()}
	/>
</AdminPageShell>
