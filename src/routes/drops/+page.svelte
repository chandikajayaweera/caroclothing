<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function getDropStatusText(status: string) {
		switch (status) {
			case 'live':
				return 'LIVE NOW';
			case 'upcoming':
				return 'COMING SOON';
			case 'archived':
				return 'ARCHIVED';
			default:
				return 'DRAFT';
		}
	}

	function getDropDateText(drop: any) {
		if (drop.status === 'live' && drop.launchAt) {
			return `Released ${new Date(drop.launchAt).toLocaleDateString()}`;
		}
		if (drop.status === 'upcoming' && drop.launchAt) {
			return `Launching ${new Date(drop.launchAt).toLocaleDateString()}`;
		}
		return 'Ended';
	}
</script>

<svelte:head>
	<title>Drops | Caro Clothing</title>
</svelte:head>

<div class="min-h-screen bg-void px-4 pt-20 pb-32 md:px-8 lg:px-12">
	<div class="mx-auto max-w-7xl">
		<header class="mb-16 md:mb-24">
			<h1 class="font-display text-6xl leading-[0.85] text-bone uppercase md:text-8xl lg:text-9xl">
				DROPS
			</h1>
			<p class="mt-4 max-w-md font-mono text-xs tracking-[0.2em] text-ash uppercase">
				Limited releases. Real stock. No restocks.
			</p>
		</header>

		<div class="flex flex-col gap-8 md:gap-12">
			{#if data.drops.length === 0}
				<div class="border border-dashed border-charcoal py-20 text-center">
					<p class="font-mono text-xs text-ash uppercase">No drops released yet.</p>
				</div>
			{:else}
				{#each data.drops as drop (drop.id)}
					<a
						href="/drops/{drop.slug}"
						class="group relative overflow-hidden border border-charcoal bg-charcoal/30 p-8 transition-all duration-500 hover:border-ash/20 md:p-12 lg:p-16"
					>
						<!-- Status Badge -->
						<div class="mb-6 flex items-center gap-3">
							<span
								class="font-mono text-[10px] tracking-widest uppercase {drop.status === 'live'
									? 'text-volt'
									: 'text-ash/60'}"
							>
								{getDropStatusText(drop.status)}
							</span>
							{#if drop.status === 'live'}
								<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-volt"></span>
							{/if}
						</div>

						<div class="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
							<div>
								<h2
									class="font-display text-5xl text-bone uppercase transition-colors group-hover:text-volt md:text-7xl lg:text-8xl"
								>
									{drop.name}
								</h2>
								<p class="mt-2 max-w-md font-sans text-sm text-ash md:text-base">
									{drop.tagline ?? ''}
								</p>
							</div>

							<div class="flex flex-col items-start gap-4 md:items-end">
								<span class="font-mono text-[10px] tracking-widest text-ash/40 uppercase">
									{getDropDateText(drop)}
								</span>
								<span
									class="border-b border-bone/20 font-mono text-[11px] tracking-[0.2em] text-bone uppercase transition-all group-hover:border-volt group-hover:text-volt"
								>
									View Drop →
								</span>
							</div>
						</div>

						<!-- Visual Background Decoration -->
						<div
							class="pointer-events-none absolute -right-8 -bottom-8 font-display text-[120px] text-bone/5 uppercase opacity-[0.02] transition-opacity select-none group-hover:opacity-[0.05] md:text-[200px]"
						>
							{drop.slug}
						</div>
					</a>
				{/each}
			{/if}
		</div>
	</div>
</div>
