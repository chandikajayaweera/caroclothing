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
			content: 'Oversized fit. True to size. Model is 6\'1" wearing size L.'
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

<svelte:head>
	<title>{product.name} | Caro Clothing</title>
	<meta name="description" content={product.description} />
</svelte:head>

<div class="min-h-screen bg-void lg:pt-16">
	<!-- Main Product Section -->
	<div class="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[55%_45%] lg:gap-0">
		<!-- Left Col: Image Gallery -->
		<div class="no-scrollbar overflow-y-auto lg:sticky lg:top-16 lg:h-[calc(100vh-64px)]">
			<PDPImageGallery images={product.images} />
		</div>

		<!-- Right Col: Product Info -->
		<div class="flex flex-col px-4 py-6 md:px-6 md:py-8 lg:px-10 lg:py-12">
			<span class="mb-1 font-mono text-[9px] tracking-[0.2em] text-ash/60 uppercase">
				{product.sku}
			</span>
			<h1
				class="mb-4 font-display text-5xl leading-none text-bone uppercase md:text-6xl lg:text-7xl"
			>
				{product.name}
			</h1>

			<div class="mb-8 flex items-baseline gap-3">
				<span class="font-mono text-2xl text-bone">LKR {product.price.toLocaleString()}</span>
				{#if product.compareAtPrice}
					<span class="font-mono text-sm text-ash line-through">
						LKR {product.compareAtPrice.toLocaleString()}
					</span>
				{/if}
				{#if product.stockStatus === 'low-stock'}
					<span
						class="ml-2 bg-volt px-2 py-0.5 font-mono text-[9px] tracking-[0.15em] text-void uppercase"
					>
						LOW STOCK
					</span>
					<span class="ml-1 font-mono text-[10px] tracking-widest text-ash uppercase">
						Only {product.availableCount} left
					</span>
				{/if}
			</div>

			<div class="flex flex-col gap-8">
				<ColorSelector colors={product.colors} {activeColor} onSelect={(c) => (activeColor = c)} />

				<SizeSelector sizes={product.sizes} {activeSize} onSelect={(s) => (activeSize = s)} />
			</div>

			<!-- CTAs -->
			<div class="mt-10 flex flex-col gap-3">
				<Button variant="primary" class="w-full py-4" onclick={addToCart}>Add to Cart</Button>
				<Button variant="outline" class="w-full py-4">Save to Wishlist</Button>
			</div>

			<!-- Product Details -->
			<ProductAccordion {panels} />

			<!-- Shipping Estimate -->
			<ShippingEstimate />
		</div>
	</div>

	<!-- Reviews Section -->
	<div class="mx-auto mt-12 max-w-7xl border-t border-charcoal px-4 md:px-6 lg:px-12">
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
