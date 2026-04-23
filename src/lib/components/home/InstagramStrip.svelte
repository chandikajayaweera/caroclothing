<script lang="ts">
	const handle = "@CAROAPPAREL";
	const hashtag = "#CAROAPPAREL";
</script>

<section class="bg-void py-20 border-t border-charcoal/50">
	<div class="px-4 md:px-8 lg:px-12 max-w-7xl mx-auto">
		<header class="flex justify-between items-end mb-10">
			<h2 class="font-display text-4xl md:text-5xl text-bone uppercase tracking-tight">{handle}</h2>
			<a href="https://instagram.com/caroapparel" target="_blank" rel="noopener noreferrer" class="font-mono text-[10px] text-volt uppercase tracking-[0.2em] hover:underline mb-2">
				FOLLOW US
			</a>
		</header>

		<!-- Image Strip -->
		<div class="flex gap-4 overflow-x-auto no-scrollbar pb-6 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
			{#each Array(5) as _}
				<div class="min-w-[200px] md:min-w-0 aspect-square bg-charcoal flex items-center justify-center border border-charcoal hover:border-ash/20 transition-all duration-500 group">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera text-ash/20 group-hover:text-volt/30 transition-colors">
						<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
						<circle cx="12" cy="13" r="3"/>
					</svg>
				</div>
			{/each}
		</div>

		<div class="mt-10 text-center">
			<span class="font-mono text-[10px] text-ash uppercase tracking-[0.3em]">
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
