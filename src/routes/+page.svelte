<script lang="ts">
	import HeroSection from '$lib/components/home/HeroSection.svelte';
	import NewInGrid from '$lib/components/home/NewInGrid.svelte';
	import SocialProofRail from '$lib/components/home/SocialProofRail.svelte';
	import EditorialBanner from '$lib/components/home/EditorialBanner.svelte';
	import DropTeaser from '$lib/components/home/DropTeaser.svelte';
	import InstagramStrip from '$lib/components/home/InstagramStrip.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Caro Clothing | Sri Lankan Streetwear</title>
	<meta
		name="description"
		content="Caro Clothing is a Sri Lankan streetwear brand that sells high-quality clothing to customers in Sri Lanka and around the world."
	/>
</svelte:head>

<HeroSection featuredDrop={data.featuredDrop} />
<NewInGrid products={data.newArrivals} />
<SocialProofRail reviews={data.recentReviews} />
{#if data.featuredDrop && data.featuredDrop.status === 'teaser' && !data.featuredDrop.heroImageUrl}
	<!-- Only render secondary teaser if it wasn't featured as the main visual hero drop -->
	<DropTeaser nextDrop={{
		name: data.featuredDrop.name,
		tagline: data.featuredDrop.tagline || '',
		date: data.featuredDrop.launchAt ? new Date(data.featuredDrop.launchAt) : new Date(),
		slug: data.featuredDrop.slug
	}} />
{/if}
<InstagramStrip products={data.newArrivals} />
<EditorialBanner featuredProduct={data.featuredProduct} />
