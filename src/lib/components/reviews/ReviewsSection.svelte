<script lang="ts">
	import ReviewCard from './ReviewCard.svelte';

	type Review = {
		id: string;
		user: string;
		rating: number;
		title: string;
		body: string;
		isVerifiedPurchase: boolean;
		date: string;
	};

	type ReviewSummary = {
		average: number;
		count: number;
	};

	let { summary, reviews }: { summary: ReviewSummary; reviews: Review[] } = $props();

	const distribution = [
		{ stars: 5, count: 15 },
		{ stars: 4, count: 5 },
		{ stars: 3, count: 2 },
		{ stars: 2, count: 1 },
		{ stars: 1, count: 0 }
	];
</script>

<section class="py-12 md:py-16">
	<h2 class="mb-8 font-display text-4xl text-bone uppercase md:text-5xl">Reviews</h2>

	<div class="lg:grid lg:grid-cols-[280px_1fr] lg:gap-16">
		<!-- Rating summary sticky left -->
		<div class="mb-12 flex h-fit flex-col gap-6 lg:sticky lg:top-24 lg:mb-0">
			<div class="flex items-baseline gap-3">
				<span class="font-display text-6xl leading-none text-volt">{summary.average}</span>
				<div class="flex flex-col">
					<div class="flex text-volt">
						{#each [0, 1, 2, 3, 4] as i (i)}
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
					<span class="mt-1 font-mono text-[9px] tracking-widest text-ash uppercase">
						Based on {summary.count} reviews
					</span>
				</div>
			</div>

			<!-- Distribution bars -->
			<div class="flex flex-col gap-2">
				{#each distribution as dist (dist.stars)}
					<div class="flex items-center gap-3">
						<span class="w-2 font-mono text-[9px] text-ash">{dist.stars}</span>
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-charcoal">
							<div
								class="h-full bg-volt"
								style="width: {(dist.count / summary.count) * 100}%"
							></div>
						</div>
						<span class="w-4 text-right font-mono text-[9px] text-ash/40">{dist.count}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Review cards -->
		<div class="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-2">
			{#each reviews as review (review.id)}
				<ReviewCard {review} />
			{/each}
		</div>
	</div>
</section>
