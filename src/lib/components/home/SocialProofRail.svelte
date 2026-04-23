<script lang="ts">
	const reviews = [
		{
			id: 'r1',
			user: 'Kasun M.',
			rating: 5,
			title: 'Best tee I own.',
			excerpt: 'Wore this to a show in Colombo. Got stopped three times. The fit is exactly as described.',
			isVerifiedPurchase: true,
			productName: 'Void Oversized Tee',
			productSlug: 'void-oversized-tee'
		},
		{
			id: 'r2',
			user: 'Dilini S.',
			rating: 4,
			title: 'Quality is real.',
			excerpt: "Fabric is thick. Graphic doesn't fade after washing. Worth every rupee.",
			isVerifiedPurchase: true,
			productName: 'Bone Staple Tee',
			productSlug: 'bone-staple-tee'
		},
		{
			id: 'r3',
			user: 'Arjun P.',
			rating: 5,
			title: 'Colombo standard.',
			excerpt: 'Finally a local brand that understands proportions. This is world class streetwear.',
			isVerifiedPurchase: true,
			productName: 'Void Oversized Tee',
			productSlug: 'void-oversized-tee'
		}
	];
</script>

<section class="py-20 bg-void border-y border-charcoal/50">
	<div class="px-4 md:px-8 lg:px-12 max-w-7xl mx-auto">
		<header class="mb-10">
			<h2 class="font-display text-4xl md:text-5xl text-bone uppercase tracking-tight">WHAT THEY'RE SAYING</h2>
			<p class="font-mono text-[10px] text-ash uppercase tracking-[0.2em] mt-2">Based on verified purchases</p>
		</header>

		<!-- Horizontal Scroll on Mobile, Grid on Desktop -->
		<div class="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto no-scrollbar pb-4 md:pb-0 scroll-snap-x">
			{#each reviews as review}
				<div class="min-w-[280px] md:min-w-0 bg-charcoal/40 p-6 flex flex-col gap-4 border border-charcoal hover:border-ash/20 transition-colors scroll-snap-align-start">
					<div class="flex justify-between items-start">
						<div class="flex gap-0.5 text-bone">
							{#each Array(5) as _, i}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill={i < review.rating ? 'currentColor' : 'none'}
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polygon
										points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
									/>
								</svg>
							{/each}
						</div>
						<span class="font-mono text-[11px] text-bone/50">{review.rating}.0</span>
					</div>

					<div>
						<h4 class="font-sans text-sm font-semibold text-bone mb-1">{review.title}</h4>
						<p class="font-sans text-[13px] text-bone/70 leading-relaxed line-clamp-2">"{review.excerpt}"</p>
					</div>

					<div class="mt-auto pt-4 flex flex-col gap-2 border-t border-charcoal">
						<div class="flex items-center justify-between">
							<span class="font-sans text-[11px] font-medium text-bone">{review.user}</span>
							{#if review.isVerifiedPurchase}
								<span class="font-mono text-[9px] text-volt uppercase tracking-widest flex items-center gap-1">
									<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>
									Verified
								</span>
							{/if}
						</div>
						<a href="/shop/{review.productSlug}" class="font-mono text-[9px] text-ash uppercase tracking-widest hover:text-volt transition-colors">
							{review.productName}
						</a>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scroll-snap-x {
		scroll-snap-type: x mandatory;
	}
	.scroll-snap-align-start {
		scroll-snap-align: start;
	}
</style>
