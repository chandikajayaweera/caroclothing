<script lang="ts">
	import { slide } from 'svelte/transition';

	let { panels }: { panels: { id: string; title: string; content: string }[] } = $props();

	let activePanel = $state<string | null>(null);

	function togglePanel(id: string) {
		activePanel = activePanel === id ? null : id;
	}
</script>

<div class="mt-8 flex flex-col border-t border-charcoal">
	{#each panels as panel}
		<div class="border-b border-charcoal">
			<button
				class="flex w-full items-center justify-between py-4 font-mono text-[10px] tracking-[0.15em] text-ash uppercase transition-colors hover:text-bone"
				onclick={() => togglePanel(panel.id)}
			>
				{panel.title}
				<span>{activePanel === panel.id ? '−' : '+'}</span>
			</button>
			{#if activePanel === panel.id}
				<div
					class="pb-5 font-sans text-sm leading-relaxed whitespace-pre-line text-bone/80"
					transition:slide
				>
					{panel.content}
				</div>
			{/if}
		</div>
	{/each}
</div>
