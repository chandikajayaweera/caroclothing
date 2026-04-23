<script lang="ts">
	import PDPImageGallery from '$lib/components/product/PDPImageGallery.svelte';
	import ColorSelector from '$lib/components/product/ColorSelector.svelte';
	import SizeSelector from '$lib/components/product/SizeSelector.svelte';
	import ProductAccordion from '$lib/components/product/ProductAccordion.svelte';
	import ShippingEstimate from '$lib/components/product/ShippingEstimate.svelte';
	import ReviewsSection from '$lib/components/reviews/ReviewsSection.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { cartStore } from '$lib/client/modules/stores/cart';
	import { addToast } from '$lib/client/modules/stores/toast';
	import { openCartDrawer } from '$lib/client/modules/stores/ui';

	const product = {
		name: 'Void Oversized Tee',
		sku: 'CARO-BLK-001',
		price: 3200,
		compareAtPrice: 4000,
		shortDescription: 'The tee you reach for every time.',
		description:
			'Heavyweight 220GSM combed cotton. Dropped shoulders. Oversized fit. Graphic front print — original artwork, not a stock image. Made in Sri Lanka.',
		material: '100% Combed Cotton 220GSM',
		careInstructions: 'Machine wash cold inside out. No tumble dry. Iron reverse.',
		fit: 'oversized',
		images: [
			{ url: '/images/black_tee.png', alt: 'Front view' },
			{ url: '/images/editorial.png', alt: 'Styled shot' }
		],
		colors: [
			{ name: 'Void Black', hex: '#0A0A0A' },
			{ name: 'Ash Grey', hex: '#B4AFA8' }
		],
		sizes: [
			{ size: 'XS', available: true },
			{ size: 'S', available: true },
			{ size: 'M', available: true },
			{ size: 'L', available: false },
			{ size: 'XL', available: true, backorder: true },
			{ size: 'XXL', available: false }
		],
		stockStatus: 'low-stock',
		availableCount: 4,
		reviewSummary: { average: 4.7, count: 23 },
		reviews: [
			{
				id: 'r1',
				user: 'Kasun M.',
				rating: 5,
				title: 'Best tee I own.',
				body: 'Wore this to a show in Colombo. Got stopped three times. The fit is exactly as described — properly oversized without looking sloppy.',
				isVerifiedPurchase: true,
				date: 'March 2025'
			},
			{
				id: 'r2',
				user: 'Dilini S.',
				rating: 4,
				title: 'Quality is real.',
				body: "Fabric is thick. Graphic doesn't fade after washing. Would've given 5 but delivery took a week.",
				isVerifiedPurchase: true,
				date: 'April 2025'
			}
		]
	};

	const panels = [
		{ id: 'details', title: 'Details', content: product.description },
		{
			id: 'care',
			title: 'Material & Care',
			content: `${product.material}\n\n${product.careInstructions}`
		},
		{
			id: 'fit',
			title: 'Fit & Sizing',
			content: "Oversized fit. True to size. Model is 6'1\" wearing size L."
		}
	];

	let activeColor = $state(product.colors[0].name);
	let activeSize = $state('');

	function addToCart() {
		if (!activeSize) {
			addToast('Please select a size', 'error');
			return;
		}

		cartStore.update((s) => ({
			...s,
			items: [
				...s.items,
				{
					id: Math.random().toString(36).substring(7),
					variantId: 'v1',
					productId: 'p1',
					name: product.name,
					color: activeColor,
					size: activeSize,
					sku: product.sku,
					unitPrice: product.price,
					quantity: 1,
					image: product.images[0].url
				}
			]
		}));

		addToast('Added to bag');
		openCartDrawer();
	}
</script>

<div class="min-h-screen lg:pt-16 bg-void">
	<!-- Main Product Section -->
	<div class="lg:grid lg:grid-cols-[55%_45%] lg:gap-0 max-w-[1600px] mx-auto">
		<!-- Left Col: Image Gallery -->
		<div class="lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] overflow-y-auto no-scrollbar">
			<PDPImageGallery images={product.images} />
		</div>

		<!-- Right Col: Product Info -->
		<div class="px-4 py-6 md:px-6 md:py-8 lg:px-10 lg:py-12 flex flex-col">
			<span class="font-mono text-[9px] text-ash/60 uppercase tracking-[0.2em] mb-1">
				{product.sku}
			</span>
			<h1 class="font-display text-5xl md:text-6xl lg:text-7xl text-bone leading-none mb-4 uppercase">
				{product.name}
			</h1>

			<div class="flex items-baseline gap-3 mb-8">
				<span class="font-mono text-2xl text-bone">LKR {product.price.toLocaleString()}</span>
				{#if product.compareAtPrice}
					<span class="font-mono text-sm text-ash line-through">
						LKR {product.compareAtPrice.toLocaleString()}
					</span>
				{/if}
				{#if product.stockStatus === 'low-stock'}
					<span class="bg-volt text-void font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-0.5 ml-2">
						LOW STOCK
					</span>
					<span class="font-mono text-[10px] text-ash uppercase tracking-widest ml-1">
						Only {product.availableCount} left
					</span>
				{/if}
			</div>

			<div class="flex flex-col gap-8">
				<ColorSelector
					colors={product.colors}
					{activeColor}
					onSelect={(c) => (activeColor = c)}
				/>

				<SizeSelector
					sizes={product.sizes}
					{activeSize}
					onSelect={(s) => (activeSize = s)}
				/>
			</div>

			<!-- CTAs -->
			<div class="mt-10 flex flex-col gap-3">
				<Button variant="primary" class="w-full py-4" onclick={addToCart}>
					Add to Cart
				</Button>
				<Button variant="outline" class="w-full py-4">
					Save to Wishlist
				</Button>
			</div>

			<!-- Product Details -->
			<ProductAccordion {panels} />

			<!-- Shipping Estimate -->
			<ShippingEstimate />
		</div>
	</div>

	<!-- Reviews Section -->
	<div class="px-4 md:px-6 lg:px-12 max-w-7xl mx-auto border-t border-charcoal mt-12">
		<ReviewsSection summary={product.reviewSummary} reviews={product.reviews} />
	</div>
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
