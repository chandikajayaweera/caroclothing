<script lang="ts">
	import ReviewCard from './ReviewCard.svelte';

	let { summary, reviews } = $props();

	const distribution = [
		{ stars: 5, count: 15 },
		{ stars: 4, count: 5 },
		{ stars: 3, count: 2 },
		{ stars: 2, count: 1 },
		{ stars: 1, count: 0 }
	];
</script>

<section class="py-12 md:py-16">
	<h2 class="font-display text-4xl md:text-5xl text-bone mb-8 uppercase">Reviews</h2>

	<div class="lg:grid lg:grid-cols-[280px_1fr] lg:gap-16">
		<!-- Rating summary sticky left -->
		<div class="flex flex-col gap-6 h-fit lg:sticky lg:top-24 mb-12 lg:mb-0">
			<div class="flex items-baseline gap-3">
				<span class="font-display text-6xl text-volt leading-none">{summary.average}</span>
				<div class="flex flex-col">
					<div class="flex text-volt">
						{#each Array(5) as _, i}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill={i < Math.floor(summary.average) ? 'currentColor' : 'none'}
								stroke="currentColor"
								stroke-width="2"
								class="lucide lucide-star"
							>
								<polygon
									points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
								/>
							</svg>
						{/each}
					</div>
					<span class="font-mono text-[9px] text-ash uppercase tracking-widest mt-1">
						Based on {summary.count} reviews
					</span>
				</div>
			</div>

			<!-- Distribution bars -->
			<div class="flex flex-col gap-2">
				{#each distribution as dist}
					<div class="flex items-center gap-3">
						<span class="font-mono text-[9px] text-ash w-2">{dist.stars}</span>
						<div class="flex-1 h-1 bg-charcoal rounded-full overflow-hidden">
							<div
								class="h-full bg-volt"
								style="width: {(dist.count / summary.count) * 100}%"
							></div>
						</div>
						<span class="font-mono text-[9px] text-ash/40 w-4 text-right">{dist.count}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Review cards -->
		<div class="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-2">
			{#each reviews as review}
				<ReviewCard {review} />
			{/each}
		</div>
	</div>
</section>
