<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
</script>

<svelte:head>
	<title>About Us | Caro Clothing</title>
	<meta name="description" content="The story and philosophy of Caro Clothing" />
</svelte:head>

<div class="mx-auto max-w-4xl bg-void px-4 py-16 text-bone md:py-24 lg:py-32">
	<div class="flex flex-col gap-16 md:gap-24">
		<!-- Section 1: Headline -->
		<section class="flex flex-col gap-4">
			<span class="font-mono text-[10px] tracking-[0.3em] text-volt uppercase">Our Story</span>
			<h1 class="font-display text-5xl leading-tight text-bone uppercase md:text-7xl lg:text-8xl">
				Caro Clothing is a Sri Lankan streetwear brand.
			</h1>
			<p class="mt-4 max-w-2xl font-sans text-base leading-relaxed text-ash md:text-lg">
				Founded in Colombo, Caro is built around the philosophy of contrast — blending experimental
				street aesthetics with local heritage craftsmanship. We represent the voice of contemporary
				Sri Lankan culture.
			</p>
		</section>

		<!-- Section 2: Values Grid -->
		<section class="grid grid-cols-1 gap-10 md:grid-cols-2">
			<div class="flex flex-col gap-4 border border-charcoal bg-charcoal/20 p-8">
				<span class="font-mono text-[9px] tracking-widest text-volt uppercase"
					>01 / The Release Ritual</span
				>
				<h3 class="font-display text-2xl text-bone uppercase">Small-batch releases</h3>
				<p class="font-sans text-sm leading-relaxed text-ash">
					We don't believe in mass production. Our collections stay focused, practical, and
					deliberate, with stock planned around real demand and everyday wear.
				</p>
			</div>

			<div class="flex flex-col gap-4 border border-charcoal bg-charcoal/20 p-8">
				<span class="font-mono text-[9px] tracking-widest text-volt uppercase"
					>02 / Core Staples</span
				>
				<h3 class="font-display text-2xl text-bone uppercase">Always Available</h3>
				<p class="font-sans text-sm leading-relaxed text-ash">
					We maintain a lineup of Core staples. High-grade blanks, durable fabrics, and perfect fits
					that remain restockable all year round.
				</p>
			</div>

			<div
				class="col-span-1 flex flex-col gap-4 border border-charcoal bg-charcoal/20 p-8 md:col-span-2"
			>
				<span class="font-mono text-[9px] tracking-widest text-volt uppercase"
					>03 / Made in Sri Lanka</span
				>
				<h3 class="font-display text-2xl text-bone uppercase">Locally crafted</h3>
				<p class="font-sans text-sm leading-relaxed text-ash">
					Every silhouette is designed and crafted in local workshops. We work closely with Sri
					Lankan knitwear and garment artisans to source custom heavy-cotton weaves and ensure high
					construction quality.
				</p>
			</div>
		</section>

		<!-- Section 3: Call to Action -->
		<section class="border-t border-charcoal pt-16 text-center">
			<h2 class="font-display text-3xl text-bone uppercase md:text-5xl">Explore the collection</h2>
			<p class="mx-auto mt-4 max-w-md font-mono text-[10px] tracking-widest text-ash uppercase">
				See our latest essentials and new arrivals.
			</p>
			<div class="mt-8 flex justify-center gap-4">
				<Button
					variant="primary"
					href="/shop"
					class="px-12 py-4 font-mono text-xs tracking-widest uppercase"
				>
					Shop Now
				</Button>
			</div>
		</section>
	</div>
</div>
