<script lang="ts">
	const genderOptions = ['All', 'Men', 'Women', 'Unisex'];
	const fitOptions = ['All Fits', 'Oversized', 'Regular', 'Slim'];
	
	let activeGender = $state('All');
	let activeFit = $state('All Fits');
</script>

<div class="border-b border-charcoal bg-void">
	<!-- Mobile/Tablet: Horizontal Scroll -->
	<div class="lg:hidden flex items-center h-14">
		<div class="overflow-x-auto flex gap-2 px-4 no-scrollbar flex-1">
			{#each genderOptions as gender}
				<button
					onclick={() => (activeGender = gender)}
					class="font-mono text-[9px] uppercase tracking-[0.15em] px-3 py-1.5 border whitespace-nowrap transition-colors
          {activeGender === gender ? 'border-volt bg-volt text-void' : 'border-ash/30 text-ash'}"
				>
					{gender}
				</button>
			{/each}
			<div class="w-px h-4 bg-charcoal self-center"></div>
			{#each fitOptions as fit}
				<button
					onclick={() => (activeFit = fit)}
					class="font-mono text-[9px] uppercase tracking-[0.15em] px-3 py-1.5 border whitespace-nowrap transition-colors
          {activeFit === fit ? 'border-volt bg-volt text-void' : 'border-ash/30 text-ash'}"
				>
					{fit}
				</button>
			{/each}
		</div>
		
		<!-- Mobile Sort Button -->
		<button class="px-4 h-full border-l border-charcoal text-ash hover:text-volt" aria-label="Sort products">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-filter"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>
		</button>
	</div>

	<!-- Desktop: Flex Bar -->
	<div class="hidden lg:flex items-center justify-between px-8 py-4">
		<div class="flex items-center gap-8">
			<div class="flex items-center gap-3">
				{#each genderOptions as gender}
					<button
						onclick={() => (activeGender = gender)}
						class="font-mono text-[10px] uppercase tracking-[0.15em] px-4 py-2 border transition-colors
            {activeGender === gender ? 'border-volt bg-volt text-void' : 'border-ash/30 text-ash hover:border-ash'}"
					>
						{gender}
					</button>
				{/each}
			</div>
			<div class="w-px h-6 bg-charcoal"></div>
			<div class="flex items-center gap-3">
				{#each fitOptions as fit}
					<button
						onclick={() => (activeFit = fit)}
						class="font-mono text-[10px] uppercase tracking-[0.15em] px-4 py-2 border transition-colors
            {activeFit === fit ? 'border-volt bg-volt text-void' : 'border-ash/30 text-ash hover:border-ash'}"
					>
						{fit}
					</button>
				{/each}
			</div>
		</div>

		<div class="flex items-center gap-4">
			<span class="font-mono text-[9px] text-ash uppercase tracking-widest">Sort By:</span>
			<select class="bg-transparent border border-ash/30 text-ash font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 outline-none focus:border-volt" aria-label="Sort by">
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
