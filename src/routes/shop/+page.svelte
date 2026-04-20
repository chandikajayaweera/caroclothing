<script lang="ts">
	import ProductCard from '$lib/components/product/ProductCard.svelte';
	
	// Mocking data for PLP
	const products = [
		{
			id: 'prod_1',
			name: 'Signature Box Tee // Black',
			price: 8500,
			image: '/images/black_tee.png',
			isNew: true,
			stockStatus: 'available',
			href: '/shop/signature-box-tee-black'
		},
		{
			id: 'prod_2',
			name: 'Signature Box Tee // Bone',
			price: 8500,
			image: '/images/white_tee.png',
			isNew: true,
			stockStatus: 'low_stock',
			href: '/shop/signature-box-tee-bone'
		},
		{
			id: 'prod_3',
			name: 'Oversized Hoodie // Void',
			price: 14500,
			image: '/images/black_tee.png',
			isNew: true,
			stockStatus: 'pre_order',
			href: '/shop/oversized-hoodie-void'
		},
		{
			id: 'prod_4',
			name: 'Heavyweight Pant // Charcoal',
			price: 12000,
			image: '/images/white_tee.png',
			isNew: true,
			stockStatus: 'almost_gone',
			href: '/shop/heavyweight-pant-charcoal'
		},
		{
			id: 'prod_5',
			name: 'Drop 001 Graphic // Volt',
			price: 9500,
			image: '/images/black_tee.png',
			isNew: false,
			stockStatus: 'available',
			href: '/shop/drop-001-graphic-volt'
		},
		{
			id: 'prod_6',
			name: 'Everyday Crop // Ash',
			price: 7500,
			image: '/images/white_tee.png',
			isNew: false,
			stockStatus: 'sold_out',
			href: '/shop/everyday-crop-ash'
		}
	];
</script>

<div class="bg-void min-h-screen py-16 px-4 sm:px-6 lg:px-8">
	<div class="mx-auto max-w-7xl">
		<!-- Header & Filters -->
		<div class="mb-12 flex flex-col md:flex-row md:items-end justify-between border-b border-charcoal pb-6">
			<div class="mb-6 md:mb-0">
				<h1 class="font-bebas text-5xl tracking-wide text-bone uppercase">Shop All</h1>
				<p class="font-sans text-ash mt-2">{products.length} Products</p>
			</div>
			
			<div class="flex items-center space-x-6 text-sm font-sans text-bone">
				<div class="flex space-x-4">
					<button class="font-bold underline underline-offset-4 decoration-volt">All</button>
					<button class="hover:text-volt transition-colors">Men</button>
					<button class="hover:text-volt transition-colors">Women</button>
				</div>
				<div class="h-6 w-px bg-charcoal hidden sm:block"></div>
				<div class="flex space-x-4">
					<span class="text-ash hidden sm:inline">Fit:</span>
					<select class="bg-void text-bone border-none outline-none cursor-pointer focus:ring-0 uppercase tracking-wider text-xs bg-none -ml-1">
						<option value="all">Any Fit</option>
						<option value="oversized">Oversized</option>
						<option value="regular">Regular</option>
						<option value="slim">Slim</option>
					</select>
				</div>
			</div>
		</div>

		<!-- Product Grid -->
		<div class="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each products as product}
				<ProductCard {...product} />
			{/each}
		</div>
		
		<div class="mt-20 flex justify-center">
			<button class="border border-bone text-bone hover:bg-bone hover:text-void uppercase font-bebas tracking-wide text-xl px-12 py-4 transition-colors">
				Load More
			</button>
		</div>
	</div>
</div>
