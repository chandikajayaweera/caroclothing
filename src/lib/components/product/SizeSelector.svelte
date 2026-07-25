<script lang="ts">
	let {
		sizes,
		activeSize,
		onSelect,
		onOpenSizeGuide
	}: {
		sizes: {
			size: string;
			available: boolean;
			reserved?: boolean;
			backorder?: boolean;
			quantity?: number;
			trackInventory?: boolean;
		}[];
		activeSize: string;
		onSelect: (size: string) => void;
		onOpenSizeGuide: () => void;
	} = $props();
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center justify-between">
		<span class="font-mono text-[9px] tracking-widest text-ash uppercase">
			Size: {activeSize || 'Select'}
		</span>
	</div>

	<div class="flex flex-wrap gap-2">
		{#each sizes as s (s.size)}
			{@const isLow =
				s.trackInventory && s.quantity !== undefined && s.quantity > 0 && s.quantity <= 3}
			{@const isSoldOut = !s.available && !s.backorder && !s.reserved}
			<button
				class="group relative flex h-10 w-12 cursor-pointer items-center justify-center overflow-hidden border font-mono text-xs transition-all duration-200
        {isSoldOut
					? 'cursor-not-allowed border-charcoal bg-void text-ash/30'
					: activeSize === s.size
						? 'border-volt bg-volt font-bold text-void shadow-md shadow-volt/10'
						: s.reserved
							? 'border-amber-400/50 bg-amber-950/20 text-amber-300 hover:border-amber-300'
							: s.backorder
								? 'border-ash/35 text-ash/60 italic hover:border-volt/50'
								: 'border-ash/25 text-bone hover:border-volt/80 hover:text-volt'}"
				onclick={() => (!isSoldOut ? onSelect(s.size) : null)}
				disabled={isSoldOut}
				title={isSoldOut
					? 'Sold Out'
					: isLow
						? `Only ${s.quantity} left!`
						: s.reserved
							? 'Reserved at another checkout'
							: s.backorder
								? 'Available on Backorder'
								: `${s.size} in stock`}
			>
				<!-- Diagonal cross line for sold out -->
				{#if isSoldOut}
					<span
						class="absolute inset-0 block h-full w-full after:absolute after:top-0 after:bottom-0 after:left-[47%] after:h-full after:w-px after:rotate-35 after:bg-ash/20"
					></span>
				{/if}

				<!-- Low stock indicator dot -->
				{#if isLow && activeSize !== s.size}
					<span class="absolute top-1 right-1 flex h-1.5 w-1.5">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75"
						></span>
						<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-volt"></span>
					</span>
				{/if}

				<span class="relative z-10">{s.size}</span>
			</button>
		{/each}
	</div>

	<button
		type="button"
		onclick={onOpenSizeGuide}
		class="mt-1 w-fit cursor-pointer text-left font-mono text-[9px] tracking-wider text-ash/80 underline transition-colors hover:text-volt"
	>
		SIZE GUIDE
	</button>
</div>
