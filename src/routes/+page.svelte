<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import ProductCard from '$lib/components/product/ProductCard.svelte';

	// Mocking data for the "Drop"
	const newArrivals = [
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
		}
	];
</script>

<!-- Hero Section -->
<section class="relative h-[85vh] w-full bg-void flex items-center justify-center overflow-hidden">
	<div class="absolute inset-x-0 bottom-0 top-0 opacity-80 mix-blend-luminosity grayscale">
		<img
			src="/images/hero.png"
			alt="Caro Clothing Drop Campaign featuring oversized streetwear"
			class="h-full w-full object-cover object-center"
		/>
	</div>
	
	<!-- Gradient overlay to ensure text readability -->
	<div class="absolute inset-0 bg-linear-to-t from-void via-void/50 to-transparent"></div>
	
	<div class="relative z-10 flex flex-col items-center text-center px-4 pt-48">
		<h1 class="font-bebas text-6xl md:text-8xl tracking-widest text-bone uppercase leading-none drop-shadow-2xl">
			Wear the Next<br/>Generation.
		</h1>
		<p class="font-sans text-ash mt-6 max-w-lg mx-auto md:text-lg mb-10 text-balance">
			The new drop. Built different. Local made. Global worn.
		</p>
		<Button href="/shop/drop-001" variant="volt" class="shadow-[0_0_40px_-10px_rgba(200,255,0,0.5)]">
			Shop the Drop
		</Button>
	</div>
</section>

<!-- New Arrivals Section -->
<section class="bg-void py-24 px-4 sm:px-6 lg:px-8 border-t border-charcoal">
	<div class="mx-auto max-w-7xl">
		<div class="flex items-end justify-between mb-12">
			<div>
				<h2 class="font-bebas text-5xl tracking-wide text-bone uppercase">New In</h2>
				<p class="font-sans text-ash mt-2">Latest pieces. Won't last.</p>
			</div>
			<div class="hidden md:block">
				<Button variant="outline" href="/shop?filter=new" class="text-sm px-4 py-2">
					View All
				</Button>
			</div>
		</div>

		<!-- Product Grid -->
		<div class="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
			{#each newArrivals as product}
				<ProductCard {...product} />
			{/each}
		</div>
		
		<div class="mt-12 md:hidden flex justify-center">
			<Button variant="outline" href="/shop?filter=new" class="w-full">
				View All
			</Button>
		</div>
	</div>
</section>

<!-- Editorial Moment -->
<section class="bg-bone relative overflow-hidden py-24 sm:py-32 border-t border-charcoal">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="lg:grid lg:grid-cols-12 lg:items-center lg:gap-16">
			<!-- Image Column -->
			<div class="lg:col-span-5 lg:col-start-1 relative group">
				<div class="relative w-full aspect-4/5 bg-charcoal overflow-hidden shadow-2xl">
					<img 
						src="/images/editorial.png" 
						alt="Caro editorial style preview" 
						class="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
					/>
					<div class="absolute inset-0 bg-void/10 group-hover:bg-transparent transition-colors duration-500"></div>
				</div>
				<!-- Decorative elements -->
				<div class="absolute -bottom-6 -right-6 h-24 w-24 bg-volt mix-blend-multiply opacity-50 blur-2xl transition-all duration-700 group-hover:scale-150 group-hover:opacity-80"></div>
				<div class="absolute -left-12 top-1/2 -translate-y-1/2 font-mono text-xs text-charcoal/40 -rotate-90 tracking-[0.3em] uppercase whitespace-nowrap font-bold">Built Different</div>
			</div>
			
			<!-- Text Column -->
			<div class="lg:col-span-6 lg:col-start-7 mt-16 lg:mt-0 relative z-10">
				<div class="flex items-center space-x-4 mb-8">
					<div class="h-0.5 w-12 bg-charcoal"></div>
					<span class="font-mono text-sm tracking-widest text-charcoal uppercase font-bold">The Ethos</span>
				</div>
				<h2 class="font-bebas text-6xl sm:text-7xl lg:text-8xl text-void uppercase tracking-wide leading-[0.85] mb-8 text-balance">
					Statements,<br/>not suggestions.
				</h2>
				<p class="font-sans text-xl text-charcoal/80 mb-10 leading-relaxed max-w-xl text-balance">
					We don't do basics. Every Caro piece has a point of view. Heavyweight fabrics, raw styling, and fits that leave room to breathe. Stop asking permission.
				</p>
				<Button variant="secondary" href="/about" size="lg" class="group">
					Our Story
					<span class="inline-block ml-3 transition-transform duration-300 group-hover:translate-x-2">→</span>
				</Button>
			</div>
		</div>
	</div>
	
	<!-- Background Monogram/Text -->
	<div class="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-[20%] hidden lg:block opacity-5 pointer-events-none select-none">
		<span class="font-bebas text-[30rem] leading-none whitespace-nowrap text-charcoal">CARO</span>
	</div>
</section>
