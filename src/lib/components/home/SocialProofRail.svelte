<script lang="ts">
	const reviews = [
		{
			id: 'r1',
			user: 'Kasun M.',
			rating: 5,
			title: 'Best tee I own.',
			excerpt:
				'Wore this to a show in Colombo. Got stopped three times. The fit is exactly as described.',
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
			excerpt:
				'Finally a local brand that understands proportions. This is world class streetwear.',
			isVerifiedPurchase: true,
			productName: 'Void Oversized Tee',
			productSlug: 'void-oversized-tee'
		}
	];
</script>

<section class="border-y border-charcoal/50 bg-void py-20">
	<div class="mx-auto max-w-7xl px-4 md:px-8 lg:px-12">
		<header class="mb-10">
			<h2 class="font-display text-4xl tracking-tight text-bone uppercase md:text-5xl">
				WHAT THEY'RE SAYING
			</h2>
			<p class="mt-2 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
				Based on verified purchases
			</p>
		</header>

		<!-- Horizontal Scroll on Mobile, Grid on Desktop -->
		<div
			class="no-scrollbar scroll-snap-x flex gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:pb-0"
		>
			{#each reviews as review}
				<div
					class="scroll-snap-align-start flex min-w-[280px] flex-col gap-4 border border-charcoal bg-charcoal/40 p-6 transition-colors hover:border-ash/20 md:min-w-0"
				>
					<div class="flex items-start justify-between">
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
						<h4 class="mb-1 font-sans text-sm font-semibold text-bone">{review.title}</h4>
						<p class="line-clamp-2 font-sans text-[13px] leading-relaxed text-bone/70">
							"{review.excerpt}"
						</p>
					</div>

					<div class="mt-auto flex flex-col gap-2 border-t border-charcoal pt-4">
						<div class="flex items-center justify-between">
							<span class="font-sans text-[11px] font-medium text-bone">{review.user}</span>
							{#if review.isVerifiedPurchase}
								<span
									class="flex items-center gap-1 font-mono text-[9px] tracking-widest text-volt uppercase"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="10"
										height="10"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="lucide lucide-check"><path d="M20 6 9 17l-5-5" /></svg
									>
									Verified
								</span>
							{/if}
						</div>
						<a
							href="/shop/{review.productSlug}"
							class="font-mono text-[9px] tracking-widest text-ash uppercase transition-colors hover:text-volt"
						>
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
