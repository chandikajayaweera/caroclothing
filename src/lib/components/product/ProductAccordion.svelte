<script lang="ts">
	import { slide } from 'svelte/transition';

	let { panels }: { panels: { id: string; title: string; content: string }[] } = $props();

	let activePanel = $state<string | null>(null);

	function togglePanel(id: string) {
		activePanel = activePanel === id ? null : id;
	}
</script>

<div class="flex flex-col border-t border-charcoal mt-8">
	{#each panels as panel}
		<div class="border-b border-charcoal">
			<button
				class="w-full flex items-center justify-between py-4 font-mono text-[10px] text-ash uppercase tracking-[0.15em] hover:text-bone transition-colors"
				onclick={() => togglePanel(panel.id)}
			>
				{panel.title}
				<span>{activePanel === panel.id ? '−' : '+'}</span>
			</button>
			{#if activePanel === panel.id}
				<div class="font-sans text-sm text-bone/80 leading-relaxed pb-5 whitespace-pre-line" transition:slide>
					{panel.content}
				</div>
			{/if}
		</div>
	{/each}
</div>
