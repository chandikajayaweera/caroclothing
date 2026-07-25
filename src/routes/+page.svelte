<script lang="ts">
	import StorefrontSection from '$lib/components/home/StorefrontSection.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Caro Clothing | Sri Lankan Streetwear</title>
	<meta
		name="description"
		content="Caro Clothing is Sri Lankan streetwear built for the next generation."
	/>
</svelte:head>

{#each data.sections as section (section.id)}
	<StorefrontSection {section} />
{/each}
