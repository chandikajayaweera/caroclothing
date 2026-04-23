<script lang="ts">
	let { images }: { images: { url: string; alt: string }[] } = $props();

	let activeIndex = $state(0);

	function nextImage() {
		activeIndex = (activeIndex + 1) % images.length;
	}

	function prevImage() {
		activeIndex = (activeIndex - 1 + images.length) % images.length;
	}
</script>

<div class="flex flex-col lg:flex-row gap-2 lg:gap-4 h-fit">
	<!-- Thumbnail strip left (Desktop) -->
	<div class="hidden lg:flex flex-col gap-2 w-[80px]">
		{#each images as img, i}
			<button
				class="aspect-[4/5] w-full overflow-hidden border-2 transition-colors
        {activeIndex === i ? 'border-volt' : 'border-transparent'}"
				onclick={() => (activeIndex = i)}
				aria-label="View product image {i + 1}"
			>
				<img src={img.url} alt={img.alt} class="w-full h-full object-cover" />
			</button>
		{/each}
	</div>

	<!-- Main image (Desktop) / Swipeable carousel (Mobile) -->
	<div class="relative flex-1 aspect-[4/5] bg-charcoal group overflow-hidden">
		<img
			src={images[activeIndex].url}
			alt={images[activeIndex].alt}
			class="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.02]"
		/>

		<!-- Mobile Navigation Dots -->
		<div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 lg:hidden">
			{#each images as _, i}
				<div
					class="transition-all duration-300
          {activeIndex === i ? 'w-4 h-[3px] bg-volt' : 'w-[3px] h-[3px] bg-ash/40'}"
				></div>
			{/each}
		</div>

		<!-- Desktop Navigation Arrows (Visible on hover) -->
		<button
			class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center bg-void/20 hover:bg-void/40 text-bone hidden lg:group-hover:flex transition-opacity"
			onclick={prevImage}
			aria-label="Previous image"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
		</button>
		<button
			class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center bg-void/20 hover:bg-void/40 text-bone hidden lg:group-hover:flex transition-opacity"
			onclick={nextImage}
			aria-label="Next image"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
		</button>
	</div>
</div>
