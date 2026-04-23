<script lang="ts">
	const lines = ['FROM COLOMBO', 'TO EVERYWHERE.'];
	const footnote = 'Sri Lankan-made. Global vision. Est. 2026.';
	const stats = ['220GSM COTTON', 'MADE IN COLOMBO', 'SHIPS ISLAND-WIDE'];
</script>

<section class="bg-charcoal py-20 md:py-32 lg:py-48 px-5 md:px-8 lg:px-12 relative overflow-hidden">
	<!-- Optional texture/background -->
	<img
		src="/images/editorial.png"
		alt=""
		class="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none"
	/>

	<div class="max-w-7xl mx-auto relative z-10">
		<div class="flex flex-col gap-2 md:gap-4 mb-12">
			<h2 class="font-display text-[60px] md:text-[90px] lg:text-[130px] leading-[0.9] text-bone uppercase">
				{lines[0]}
			</h2>
			<h2 class="font-display text-[60px] md:text-[90px] lg:text-[130px] leading-[0.9] text-volt uppercase">
				{lines[1]}
			</h2>
		</div>

		<!-- Brand Stats -->
		<div class="flex flex-wrap gap-x-4 gap-y-2 mb-8 md:mb-12">
			{#each stats as stat, i}
				<span class="font-mono text-[10px] md:text-xs text-ash uppercase tracking-[0.2em] whitespace-nowrap">
					{stat}
					{#if i < stats.length - 1}
						<span class="ml-4 text-ash/30">·</span>
					{/if}
				</span>
			{/each}
		</div>

		<div class="flex flex-col md:flex-row md:items-center gap-8">
			<a 
				href="/about" 
				class="w-fit border border-ash/30 text-ash hover:border-volt hover:text-volt px-8 py-3 font-mono text-[10px] uppercase tracking-widest transition-all duration-300"
			>
				Our Story →
			</a>
			<p class="font-mono text-[10px] text-ash/40 uppercase tracking-[0.15em]">
				{footnote}
			</p>
		</div>
	</div>
</section>
