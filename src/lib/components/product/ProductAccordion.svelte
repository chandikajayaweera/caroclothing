<script lang="ts">
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	let { panels }: { panels: { id: string; title: string; content: string }[] } = $props();

	let activePanel = $state<string | null>(null);

	function togglePanel(id: string) {
		activePanel = activePanel === id ? null : id;
	}
</script>

<div class="mt-8 flex flex-col border-t border-charcoal/60">
	{#each panels as panel (panel.id)}
		{@const isActive = activePanel === panel.id}
		<div class="border-b border-charcoal/60">
			<button
				class="flex w-full cursor-pointer items-center justify-between py-4 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors select-none focus-visible:text-volt focus-visible:outline-none
        {isActive ? 'text-volt' : 'text-ash hover:text-bone'}"
				onclick={() => togglePanel(panel.id)}
				aria-expanded={isActive}
			>
				<span>{panel.title}</span>
				<span
					class="text-xs transition-transform duration-300 {isActive
						? 'rotate-90 text-volt'
						: 'text-ash'}"
				>
					{isActive ? '−' : '+'}
				</span>
			</button>

			{#if isActive}
				<div
					class="pb-5 font-sans text-xs leading-relaxed whitespace-pre-line text-bone/85 select-text"
					transition:slide={{ duration: 250, easing: cubicOut }}
				>
					{panel.content}
				</div>
			{/if}
		</div>
	{/each}
</div>
