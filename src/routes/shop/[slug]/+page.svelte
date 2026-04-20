<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	
	// Mock product data for PDP
	let product = {
		name: 'Signature Box Tee // Black',
		price: 8500,
		sku: 'CARO-001-BLK',
		description: 'Our foundational piece. Cut from heavyweight 280gsm cotton for a structured, oversized fit. Dropped shoulders, tight collar hold. Made to fade perfectly over time.',
		features: [
			'100% Cotton (280gsm)',
			'Oversized boxy fit',
			'Dropped shoulder',
			'High ribbed collar'
		],
		images: [
			'/images/black_tee.png',
			'/images/white_tee.png'
		],
		colors: [
			{ name: 'Black', hex: '#0a0a0a', selected: true },
			{ name: 'Bone', hex: '#f8f5f0', selected: false }
		],
		sizes: [
			{ name: 'S', available: true, stock: 12 },
			{ name: 'M', available: true, stock: 3 }, // low stock
			{ name: 'L', available: false, stock: 0 }, // sold out
			{ name: 'XL', available: true, stock: 45 }
		]
	};

	let selectedSize = $state('');
	let activeImageIndex = $state(0);
	
	let formattedPrice = new Intl.NumberFormat('en-LK', {
		style: 'currency',
		currency: 'LKR',
		minimumFractionDigits: 0
	}).format(product.price);
	
	// Determine stock context for selected size
	let currentSizeObj = $derived(product.sizes.find(s => s.name === selectedSize));
	let isLowStock = $derived(currentSizeObj ? currentSizeObj.stock > 0 && currentSizeObj.stock <= 5 : false);
</script>

<div class="bg-void min-h-screen border-t border-charcoal">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-24">
		<div class="lg:grid lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16">
			
			<!-- Image Gallery -->
			<div class="flex flex-col-reverse lg:flex-row gap-4 lg:gap-6 mb-10 lg:mb-0">
				<!-- Thumbnails (Desktop side, Mobile bottom) -->
				<div class="flex lg:flex-col gap-4 overflow-x-auto lg:overflow-visible lg:w-24 shrink-0">
					{#each product.images as img, i}
						<button 
							class="relative aspect-3/4 w-20 lg:w-full shrink-0 border-2 transition-all {activeImageIndex === i ? 'border-volt' : 'border-transparent opacity-60 hover:opacity-100'}"
							onclick={() => activeImageIndex = i}
						>
							<img src={img} alt="Thumbnail {i+1}" class="w-full h-full object-cover" />
						</button>
					{/each}
				</div>
				
				<!-- Main Image -->
				<div class="relative w-full aspect-3/4 bg-charcoal grow">
					<img src={product.images[activeImageIndex]} alt={product.name} class="w-full h-full object-cover" />
					<button class="absolute top-4 right-4 text-bone hover:text-volt transition-colors z-10" aria-label="Zoom image">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
					</button>
				</div>
			</div>
			
			<!-- Product Info -->
			<div class="flex flex-col mt-4 sm:mt-0">
				<div class="mb-8">
					<div class="font-mono text-ash text-sm mb-3">{product.sku}</div>
					<h1 class="text-4xl sm:text-5xl lg:text-6xl font-bebas text-bone uppercase tracking-wide leading-none mb-4">
						{product.name}
					</h1>
					<p class="text-2xl font-mono text-volt">{formattedPrice}</p>
				</div>
				
				<div class="mb-8 font-sans text-bone/80 leading-relaxed text-balance">
					{product.description}
				</div>
				
				<!-- Color Selector -->
				<div class="mb-8">
					<h3 class="font-sans text-sm tracking-wider text-bone mb-3 flex justify-between">
						<span>Color</span>
						<span class="text-ash">{product.colors.find(c => c.selected)?.name}</span>
					</h3>
					<div class="flex space-x-3">
						{#each product.colors as color}
							<button 
								class="w-10 h-10 rounded-full border-2 transition-transform {color.selected ? 'border-volt scale-110' : 'border-charcoal hover:border-bone/50'}"
								style="background-color: {color.hex};"
								title={color.name}
							></button>
						{/each}
					</div>
				</div>
				
				<!-- Size Selector -->
				<div class="mb-10">
					<div class="flex justify-between items-end mb-3">
						<h3 class="font-sans text-sm tracking-wider text-bone">Size</h3>
						<button class="text-xs font-mono text-ash hover:text-bone underline decoration-charcoal underline-offset-4">Size Guide</button>
					</div>
					<div class="grid grid-cols-4 gap-3">
						{#each product.sizes as size}
							<button 
								class="h-12 font-mono text-sm border flex items-center justify-center transition-all 
									{selectedSize === size.name ? 'border-volt text-volt bg-volt/10' : 
									(!size.available ? 'border-charcoal text-charcoal bg-void cursor-not-allowed line-through' :
									'border-charcoal text-bone hover:border-bone')}"
								onclick={() => size.available && (selectedSize = size.name)}
								disabled={!size.available}
							>
								{size.name}
							</button>
						{/each}
					</div>
					
					{#if isLowStock && currentSizeObj}
						<p class="mt-3 text-volt font-mono text-sm animate-pulse flex items-center">
							<span class="w-2 h-2 bg-volt rounded-full mr-2"></span>
							Only {currentSizeObj.stock} left in this size
						</p>
					{/if}
				</div>
				
				<!-- Add to Cart -->
				<div class="mb-12">
					{#if !selectedSize}
						<Button variant="primary" class="w-full py-5 text-2xl h-16 opacity-50 cursor-not-allowed">
							Select a Size
						</Button>
					{:else}
						<Button variant="volt" class="w-full py-5 text-2xl shadow-[0_0_30px_-5px_rgba(200,255,0,0.3)] hover:shadow-[0_0_40px_-5px_rgba(200,255,0,0.5)] h-16 transition-shadow disabled:opacity-50">
							Add to Cart
						</Button>
					{/if}
				</div>
				
				<!-- Details Accordion -->
				<div class="border-t border-charcoal divide-y divide-charcoal font-sans text-sm">
					<details class="group" open>
						<summary class="flex justify-between items-center cursor-pointer py-4 text-bone font-bold tracking-wide uppercase">
							Details & Fit
							<span class="transition group-open:rotate-180">
								<svg fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24"><polyline points="6 9 12 15 18 9"/></svg>
							</span>
						</summary>
						<div class="text-ash pb-4 text-balance">
							<ul class="list-disc list-inside space-y-2 mt-2 font-mono text-sm leading-relaxed">
								{#each product.features as feature}
									<li>{feature}</li>
								{/each}
							</ul>
						</div>
					</details>
					
					<details class="group">
						<summary class="flex justify-between items-center cursor-pointer py-4 text-bone font-bold tracking-wide uppercase">
							Shipping & Returns
							<span class="transition group-open:rotate-180">
								<svg fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24"><polyline points="6 9 12 15 18 9"/></svg>
							</span>
						</summary>
						<div class="text-ash pb-4 space-y-3 font-mono text-xs">
							<p><strong class="text-bone">Colombo:</strong> 1-2 business days (LKR 350)</p>
							<p><strong class="text-bone">Outstation:</strong> 2-4 business days (LKR 450)</p>
							<p class="pt-2 border-t border-charcoal">Free shipping on orders over LKR 15,000. 14-day returns on unworn items.</p>
						</div>
					</details>
				</div>
				
			</div>
		</div>
	</div>
</div>
