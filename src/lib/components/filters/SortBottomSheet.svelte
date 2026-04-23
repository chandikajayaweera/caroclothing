<script lang="ts">
	import { fly, fade } from 'svelte/transition';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen, onClose }: Props = $props();

	const sortOptions = [
		{ label: 'Newest', value: 'new' },
		{ label: 'Featured', value: 'featured' },
		{ label: 'Price: Low–High', value: 'price-asc' },
		{ label: 'Price: High–Low', value: 'price-desc' }
	];

	let activeSort = $state('new');
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-void/60 z-40 lg:hidden"
		transition:fade={{ duration: 250 }}
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="button"
		tabindex="0"
		aria-label="Close sort menu"
	></div>

	<!-- Bottom Sheet -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 bg-charcoal rounded-t-none lg:hidden flex flex-col"
		transition:fly={{ y: 300, duration: 250 }}
	>
		<div class="px-5 py-4 border-b border-void flex justify-between items-center">
			<span class="font-mono text-[10px] text-ash uppercase tracking-widest">Sort By</span>
			<button class="text-ash hover:text-bone text-xl" onclick={onClose}>×</button>
		</div>

		<div class="flex flex-col">
			{#each sortOptions as option}
				<button
					class="font-sans text-sm text-bone py-4 px-5 border-b border-void/40 flex items-center justify-between text-left hover:bg-void/20 transition-colors"
					onclick={() => {
						activeSort = option.value;
						onClose();
					}}
				>
					{option.label}
					{#if activeSort === option.value}
						<div class="w-1.5 h-1.5 rounded-full bg-volt"></div>
					{/if}
				</button>
			{/each}
		</div>
		
		<!-- Safe area padding for mobile -->
		<div class="h-8"></div>
	</div>
{/if}
