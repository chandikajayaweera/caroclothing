<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Catalog"
	title="Media"
	description="Manage R2-backed product images, category images, drop hero images, review media, alt text, and ordering."
	primaryAction="Upload Media"
	items={['R2 upload', 'Alt text', 'Primary image', 'Sort order']}
/>
