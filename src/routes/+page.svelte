<script lang="ts">
	import HeroSection from '$lib/components/home/HeroSection.svelte';
	import NewInGrid from '$lib/components/home/NewInGrid.svelte';
	import SocialProofRail from '$lib/components/home/SocialProofRail.svelte';
	import EditorialBanner from '$lib/components/home/EditorialBanner.svelte';
	import DropTeaser from '$lib/components/home/DropTeaser.svelte';
	import InstagramStrip from '$lib/components/home/InstagramStrip.svelte';

	// Hardcoded next drop for demo purposes
	const nextDrop = {
		name: 'DROP 002',
		tagline: 'Something heavier. Experimental fabrics. Coming June.',
		date: new Date('2026-06-15T18:00:00'),
		slug: 'drop-002'
	};
</script>

<svelte:head>
	<title>Caro Clothing | Sri Lankan Streetwear</title>
	<meta
		name="description"
		content="Caro Clothing is a Sri Lankan streetwear brand that sells high-quality clothing to customers in Sri Lanka and around the world."
	/>
</svelte:head>

<HeroSection />
<NewInGrid />
<SocialProofRail />
<DropTeaser {nextDrop} />
<InstagramStrip />
<EditorialBanner />
