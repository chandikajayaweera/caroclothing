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
		class="fixed inset-0 z-40 bg-void/60 lg:hidden"
		transition:fade={{ duration: 250 }}
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="button"
		tabindex="0"
		aria-label="Close sort menu"
	></div>

	<!-- Bottom Sheet -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-none bg-charcoal lg:hidden"
		transition:fly={{ y: 300, duration: 250 }}
	>
		<div class="flex items-center justify-between border-b border-void px-5 py-4">
			<span class="font-mono text-[10px] tracking-widest text-ash uppercase">Sort By</span>
			<button class="text-xl text-ash hover:text-bone" onclick={onClose}>×</button>
		</div>

		<div class="flex flex-col">
			{#each sortOptions as option (option.value)}
				<button
					class="flex items-center justify-between border-b border-void/40 px-5 py-4 text-left font-sans text-sm text-bone transition-colors hover:bg-void/20"
					onclick={() => {
						activeSort = option.value;
						onClose();
					}}
				>
					{option.label}
					{#if activeSort === option.value}
						<div class="h-1.5 w-1.5 rounded-full bg-volt"></div>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Safe area padding for mobile -->
		<div class="h-8"></div>
	</div>
{/if}
