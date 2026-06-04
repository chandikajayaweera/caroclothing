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
				Founded in Colombo, Caro is built around the philosophy of contrast — blending experimental street aesthetics with local heritage craftsmanship. We represent the voice of contemporary Sri Lankan culture.
			</p>
		</section>

		<!-- Section 2: Values Grid -->
		<section class="grid grid-cols-1 gap-10 md:grid-cols-2">
			<div class="flex flex-col gap-4 border border-charcoal bg-charcoal/20 p-8">
				<span class="font-mono text-[9px] tracking-widest text-volt uppercase">01 / The Drop Ritual</span>
				<h3 class="font-display text-2xl text-bone uppercase">Limited releases</h3>
				<p class="font-sans text-sm leading-relaxed text-ash">
					We don't believe in mass production. Our Drop collections are limited, event-based releases. Once they sell out, they are archived forever. This ensures uniqueness and minimizes environmental footprint.
				</p>
			</div>

			<div class="flex flex-col gap-4 border border-charcoal bg-charcoal/20 p-8">
				<span class="font-mono text-[9px] tracking-widest text-volt uppercase">02 / Core Staples</span>
				<h3 class="font-display text-2xl text-bone uppercase">Always Available</h3>
				<p class="font-sans text-sm leading-relaxed text-ash">
					Alongside our hype drops, we maintain a lineup of Core staples. High-grade blanks, durable fabrics, and perfect fits that remain restockable all year round.
				</p>
			</div>

			<div class="flex flex-col gap-4 border border-charcoal bg-charcoal/20 p-8 col-span-1 md:col-span-2">
				<span class="font-mono text-[9px] tracking-widest text-volt uppercase">03 / Made in Sri Lanka</span>
				<h3 class="font-display text-2xl text-bone uppercase">Locally crafted</h3>
				<p class="font-sans text-sm leading-relaxed text-ash">
					Every silhouette is designed and crafted in local workshops. We work closely with Sri Lankan knitwear and garment artisans to source custom heavy-cotton weaves and ensure high construction quality.
				</p>
			</div>
		</section>

		<!-- Section 3: Call to Action -->
		<section class="border-t border-charcoal pt-16 text-center">
			<h2 class="font-display text-3xl text-bone uppercase md:text-5xl">
				Explore the collection
			</h2>
			<p class="mx-auto mt-4 max-w-md font-mono text-[10px] tracking-widest text-ash uppercase">
				See our latest core essentials and upcoming drop lists.
			</p>
			<div class="mt-8 flex justify-center gap-4">
				<Button
					variant="primary"
					href="/shop"
					class="py-4 px-12 text-xs font-mono tracking-widest uppercase"
				>
					Shop Core
				</Button>
				<Button
					variant="outline"
					href="/drops"
					class="border-charcoal hover:bg-bone hover:text-void py-4 px-12 text-xs font-mono tracking-widest uppercase"
				>
					View Drops
				</Button>
			</div>
		</section>
	</div>
</div>
