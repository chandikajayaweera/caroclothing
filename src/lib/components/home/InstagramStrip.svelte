<script lang="ts">
	let { products = [] }: { products?: any[] } = $props();
	const handle = '@CAROAPPAREL';
	const hashtag = '#CAROAPPAREL';
</script>

<section class="border-t border-charcoal/50 bg-void py-20">
	<div class="mx-auto max-w-7xl px-4 md:px-8 lg:px-12">
		<header class="mb-10 flex items-end justify-between">
			<h2 class="font-display text-4xl tracking-tight text-bone uppercase md:text-5xl">{handle}</h2>
			<a
				href="https://instagram.com/caroapparel"
				target="_blank"
				rel="noopener noreferrer"
				class="mb-2 font-mono text-[10px] tracking-[0.2em] text-volt uppercase hover:underline"
			>
				FOLLOW US
			</a>
		</header>

		<!-- Image Strip -->
		<div
			class="no-scrollbar flex gap-4 overflow-x-auto pb-6 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0"
		>
			{#each products.slice(0, 5) as product}
				{@const primaryImage = product.primaryImageUrl ?? '/placeholder.png'}
				<a
					href="/shop/{product.slug}"
					class="group flex aspect-square min-w-[200px] items-center justify-center overflow-hidden border border-charcoal bg-charcoal transition-all duration-500 hover:border-volt/40 md:min-w-0"
				>
					<img
						src={primaryImage}
						alt={product.name}
						class="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
					/>
				</a>
			{:else}
				{#each Array(5) as _}
					<div
						class="group flex aspect-square min-w-[200px] items-center justify-center border border-charcoal bg-charcoal transition-all duration-500 hover:border-ash/20 md:min-w-0"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-camera text-ash/20 transition-colors group-hover:text-volt/30"
						>
							<path
								d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
							/>
							<circle cx="12" cy="13" r="3" />
						</svg>
					</div>
				{/each}
			{/each}
		</div>

		<div class="mt-10 text-center">
			<span class="font-mono text-[10px] tracking-[0.3em] text-ash uppercase">
				TAG US IN YOUR FITS · {hashtag}
			</span>
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
</style>
