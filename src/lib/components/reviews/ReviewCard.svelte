<script lang="ts">
	interface Props {
		review: {
			id: string;
			user: string;
			rating: number;
			title: string;
			body: string;
			isVerifiedPurchase: boolean;
			date: string;
		};
	}

	let { review }: Props = $props();
</script>

<div class="bg-charcoal p-5 flex flex-col gap-2">
	<div class="flex justify-between items-start">
		<div class="flex flex-col">
			<span class="font-sans text-sm font-medium text-bone">{review.user}</span>
			<span class="font-mono text-[9px] text-ash uppercase tracking-widest">{review.date}</span>
		</div>
		<div class="flex gap-0.5 text-volt">
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
					class="lucide lucide-star"
				>
					<polygon
						points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
					/>
				</svg>
			{/each}
		</div>
	</div>

	{#if review.isVerifiedPurchase}
		<span class="font-mono text-[9px] text-volt uppercase tracking-widest flex items-center gap-1">
			<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>
			Verified Purchase
		</span>
	{/if}

	<div class="mt-2">
		<h4 class="font-sans text-sm font-semibold text-bone">{review.title}</h4>
		<p class="font-sans text-sm text-bone/75 leading-relaxed mt-1">{review.body}</p>
	</div>
</div>
