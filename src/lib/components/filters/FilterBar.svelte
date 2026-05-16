<script lang="ts">
	const genderOptions = ['All', 'Men', 'Women', 'Unisex'];
	const fitOptions = ['All Fits', 'Oversized', 'Regular', 'Slim'];

	let activeGender = $state('All');
	let activeFit = $state('All Fits');
</script>

<div
	class="sticky top-14 z-40 border-b border-charcoal bg-void/95 backdrop-blur-md md:top-[60px] lg:top-16"
>
	<!-- Mobile/Tablet: Horizontal Scroll -->
	<div class="flex h-14 items-center lg:hidden">
		<div class="no-scrollbar flex flex-1 gap-2 overflow-x-auto px-4">
			{#each genderOptions as gender}
				<button
					onclick={() => (activeGender = gender)}
					class="border px-3 py-1.5 font-mono text-[9px] tracking-[0.15em] whitespace-nowrap uppercase transition-colors
          {activeGender === gender ? 'border-volt bg-volt text-void' : 'border-ash/30 text-ash'}"
				>
					{gender}
				</button>
			{/each}
			<div class="h-4 w-px self-center bg-charcoal"></div>
			{#each fitOptions as fit}
				<button
					onclick={() => (activeFit = fit)}
					class="border px-3 py-1.5 font-mono text-[9px] tracking-[0.15em] whitespace-nowrap uppercase transition-colors
          {activeFit === fit ? 'border-volt bg-volt text-void' : 'border-ash/30 text-ash'}"
				>
					{fit}
				</button>
			{/each}
		</div>

		<!-- Mobile Sort Button -->
		<button
			class="h-full border-l border-charcoal px-4 text-ash hover:text-volt"
			aria-label="Sort products"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="lucide lucide-list-filter"
				><path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" /></svg
			>
		</button>
	</div>

	<!-- Desktop: Flex Bar -->
	<div class="hidden items-center justify-between px-8 py-4 lg:flex">
		<div class="flex items-center gap-8">
			<div class="flex items-center gap-3">
				{#each genderOptions as gender}
					<button
						onclick={() => (activeGender = gender)}
						class="border px-4 py-2 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors
            {activeGender === gender
							? 'border-volt bg-volt text-void'
							: 'border-ash/30 text-ash hover:border-ash'}"
					>
						{gender}
					</button>
				{/each}
			</div>
			<div class="h-6 w-px bg-charcoal"></div>
			<div class="flex items-center gap-3">
				{#each fitOptions as fit}
					<button
						onclick={() => (activeFit = fit)}
						class="border px-4 py-2 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors
            {activeFit === fit
							? 'border-volt bg-volt text-void'
							: 'border-ash/30 text-ash hover:border-ash'}"
					>
						{fit}
					</button>
				{/each}
			</div>
		</div>

		<div class="flex items-center gap-4">
			<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Sort By:</span>
			<select
				class="border border-ash/30 bg-transparent px-3 py-1.5 font-mono text-[10px] tracking-widest text-ash uppercase outline-none focus:border-volt"
				aria-label="Sort by"
			>
				<option value="new">Newest</option>
				<option value="featured">Featured</option>
				<option value="price-asc">Price: Low–High</option>
				<option value="price-desc">Price: High–Low</option>
			</select>
		</div>
	</div>
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
