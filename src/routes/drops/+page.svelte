<script lang="ts">
	const drops = [
		{
			id: 'd1',
			name: 'DROP 001',
			status: 'LIVE NOW',
			tagline: 'The foundation. Heavyweight essentials.',
			date: 'Released May 2026',
			slug: 'drop-001',
			isLive: true
		},
		{
			id: 'd2',
			name: 'DROP 002',
			status: 'COMING SOON',
			tagline: 'Experimental textures. Oversized silhouettes.',
			date: 'June 15, 2026',
			slug: 'drop-002',
			isLive: false
		}
	];
</script>

<svelte:head>
	<title>Drops | Caro Clothing</title>
</svelte:head>

<div class="min-h-screen bg-void pt-20 pb-32 px-4 md:px-8 lg:px-12">
	<div class="max-w-7xl mx-auto">
		<header class="mb-16 md:mb-24">
			<h1 class="font-display text-6xl md:text-8xl lg:text-9xl text-bone uppercase leading-[0.85]">DROPS</h1>
			<p class="font-mono text-xs text-ash uppercase tracking-[0.2em] mt-4 max-w-md">
				Limited releases. Real stock. No restocks.
			</p>
		</header>

		<div class="flex flex-col gap-8 md:gap-12">
			{#each drops as drop}
				<a 
					href="/drops/{drop.slug}" 
					class="group relative bg-charcoal/30 border border-charcoal hover:border-ash/20 p-8 md:p-12 lg:p-16 transition-all duration-500 overflow-hidden"
				>
					<!-- Status Badge -->
					<div class="mb-6 flex items-center gap-3">
						<span class="font-mono text-[10px] uppercase tracking-widest {drop.isLive ? 'text-volt' : 'text-ash/60'}">
							{drop.status}
						</span>
						{#if drop.isLive}
							<span class="w-1.5 h-1.5 rounded-full bg-volt animate-pulse"></span>
						{/if}
					</div>

					<div class="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
						<div>
							<h2 class="font-display text-5xl md:text-7xl lg:text-8xl text-bone uppercase group-hover:text-volt transition-colors">
								{drop.name}
							</h2>
							<p class="font-sans text-sm md:text-base text-ash mt-2 max-w-md">
								{drop.tagline}
							</p>
						</div>

						<div class="flex flex-col items-start md:items-end gap-4">
							<span class="font-mono text-[10px] text-ash/40 uppercase tracking-widest">
								{drop.date}
							</span>
							<span class="font-mono text-[11px] text-bone uppercase tracking-[0.2em] border-b border-bone/20 group-hover:border-volt group-hover:text-volt transition-all">
								View Drop →
							</span>
						</div>
					</div>

					<!-- Visual Background Decoration -->
					<div class="absolute -right-8 -bottom-8 font-display text-[120px] md:text-[200px] text-bone/5 opacity-[0.02] pointer-events-none group-hover:opacity-[0.05] transition-opacity uppercase select-none">
						{drop.name.split(' ')[1]}
					</div>
				</a>
			{/each}
		</div>
	</div>
</div>
