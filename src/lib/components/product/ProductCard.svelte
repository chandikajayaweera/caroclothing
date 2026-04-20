<script lang="ts">
	import Button from '../ui/Button.svelte';

	let {
		name = 'Product Name',
		price = 0,
		compareAtPrice = null,
		image = '',
		hoverImage = '',
		isNew = false,
		stockStatus = 'available', // available, low_stock, almost_gone, sold_out, pre_order
		href = '#',
	} = $props();

	let formattedPrice = new Intl.NumberFormat('en-LK', {
		style: 'currency',
		currency: 'LKR',
		minimumFractionDigits: 0
	}).format(price);

	let formattedComparePrice = compareAtPrice ? new Intl.NumberFormat('en-LK', {
		style: 'currency',
		currency: 'LKR',
		minimumFractionDigits: 0
	}).format(compareAtPrice) : null;

	let isHovering = $state(false);
</script>

<a
	{href}
	class="group relative block w-full overflow-hidden"
	onmouseenter={() => (isHovering = true)}
	onmouseleave={() => (isHovering = false)}
>
	<!-- Image Container -->
	<div class="relative w-full aspect-[3/4] bg-charcoal mb-4 overflow-hidden">
		<!-- New Badge -->
		{#if isNew}
			<div class="absolute top-4 left-4 z-10 bg-void text-bone px-3 py-1 text-xs font-mono uppercase tracking-wider">
				New Drop
			</div>
		{/if}

		<!-- Stock Badge -->
		{#if stockStatus === 'low_stock'}
			<div class="absolute top-4 right-4 z-10 bg-volt text-void px-3 py-1 text-xs font-mono uppercase tracking-wider font-bold">
				Low Stock
			</div>
		{:else if stockStatus === 'almost_gone'}
			<div class="absolute top-4 right-4 z-10 bg-volt text-void px-3 py-1 text-xs font-mono uppercase tracking-wider font-bold">
				Almost Gone
			</div>
		{:else if stockStatus === 'sold_out'}
			<div class="absolute top-4 right-4 z-10 bg-ash text-void px-3 py-1 text-xs font-mono uppercase tracking-wider">
				Sold Out
			</div>
		{:else if stockStatus === 'pre_order'}
			<div class="absolute top-4 right-4 z-10 bg-bone text-void px-3 py-1 text-xs font-mono uppercase tracking-wider">
				Pre-Order
			</div>
		{/if}

		<!-- Image -->
		<img
			src={isHovering && hoverImage ? hoverImage : image}
			alt={name}
			class="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
		/>
	</div>

	<!-- Info -->
	<div class="flex flex-col">
		<h3 class="text-xl font-bebas text-bone mb-1 uppercase tracking-wide truncate">{name}</h3>
		<div class="flex items-center space-x-3 text-sm font-mono">
			{#if formattedComparePrice}
				<span class="text-ash line-through">{formattedComparePrice}</span>
				<span class="text-volt">{formattedPrice}</span>
			{:else}
				<span class="text-bone">{formattedPrice}</span>
			{/if}
		</div>
	</div>
</a>
