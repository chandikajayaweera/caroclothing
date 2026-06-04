<script lang="ts">
	import Button from '../ui/Button.svelte';

	let { featuredProduct = null }: { featuredProduct?: any } = $props();

	const hasProduct = $derived(featuredProduct !== null);
	const imageUrl = $derived(featuredProduct?.primaryImageUrl ?? '/images/editorial.png');

	const lines = $derived(hasProduct
		? [featuredProduct.name, 'FEATURED STYLE']
		: ['FROM COLOMBO', 'TO EVERYWHERE.']
	);

	const footnote = $derived(hasProduct
		? (featuredProduct.shortDescription || 'Sri Lankan-made. Global vision.')
		: 'Sri Lankan-made. Global vision. Est. 2026.'
	);

	const stats = $derived(hasProduct
		? [
				featuredProduct.material || 'PREMIUM COTTON',
				`FIT: ${featuredProduct.fit || 'STANDARD'}`,
				`GENDER: ${featuredProduct.gender || 'UNISEX'}`
			]
		: ['220GSM COTTON', 'MADE IN COLOMBO', 'SHIPS ISLAND-WIDE']
	);

	const href = $derived(hasProduct ? `/shop/${featuredProduct.slug}` : '/about');
	const ctaLabel = $derived(hasProduct ? 'Shop Featured Style →' : 'Our Story →');
</script>

<section class="relative overflow-hidden bg-charcoal px-5 py-20 md:px-8 md:py-32 lg:px-12 lg:py-48">
	<!-- Optional texture/background -->
	<img
		src={imageUrl}
		alt=""
		class="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-10"
	/>

	<div class="relative z-10 mx-auto max-w-7xl">
		<div class="mb-12 flex flex-col gap-2 md:gap-4">
			<h2
				class="font-display text-[60px] leading-[0.9] text-bone uppercase md:text-[90px] lg:text-[130px] line-clamp-1"
			>
				{lines[0]}
			</h2>
			<h2
				class="font-display text-[60px] leading-[0.9] text-volt uppercase md:text-[90px] lg:text-[130px]"
			>
				{lines[1]}
			</h2>
		</div>

		<!-- Brand Stats -->
		<div class="mb-8 flex flex-wrap gap-x-4 gap-y-2 md:mb-12">
			{#each stats as stat, i}
				<span
					class="font-mono text-[10px] tracking-[0.2em] whitespace-nowrap text-ash uppercase md:text-xs"
				>
					{stat}
					{#if i < stats.length - 1}
						<span class="ml-4 text-ash/30">·</span>
					{/if}
				</span>
			{/each}
		</div>

		<div class="flex flex-col gap-8 md:flex-row md:items-center">
			<a
				href={href}
				class="w-fit border border-ash/30 px-8 py-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-all duration-300 hover:border-volt hover:text-volt"
			>
				{ctaLabel}
			</a>
			<p class="font-mono text-[10px] tracking-[0.15em] text-ash/40 uppercase">
				{footnote}
			</p>
		</div>
	</div>
</section>
