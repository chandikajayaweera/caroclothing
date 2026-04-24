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

<div class="flex h-fit flex-col gap-2 lg:flex-row lg:gap-4">
	<!-- Thumbnail strip left (Desktop) -->
	<div class="hidden w-[80px] flex-col gap-2 lg:flex">
		{#each images as img, i}
			<button
				class="aspect-[4/5] w-full overflow-hidden border-2 transition-colors
        {activeIndex === i ? 'border-volt' : 'border-transparent'}"
				onclick={() => (activeIndex = i)}
				aria-label="View product image {i + 1}"
			>
				<img src={img.url} alt={img.alt} class="h-full w-full object-cover" />
			</button>
		{/each}
	</div>

	<!-- Main image (Desktop) / Swipeable carousel (Mobile) -->
	<div class="group relative aspect-[4/5] flex-1 overflow-hidden bg-charcoal">
		<img
			src={images[activeIndex].url}
			alt={images[activeIndex].alt}
			class="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
		/>

		<!-- Mobile Navigation Dots -->
		<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 lg:hidden">
			{#each images as _, i}
				<div
					class="transition-all duration-300
          {activeIndex === i ? 'h-[3px] w-4 bg-volt' : 'h-[3px] w-[3px] bg-ash/40'}"
				></div>
			{/each}
		</div>

		<!-- Desktop Navigation Arrows (Visible on hover) -->
		<button
			class="absolute top-1/2 left-4 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-void/20 text-bone transition-opacity hover:bg-void/40 lg:group-hover:flex"
			onclick={prevImage}
			aria-label="Previous image"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6" /></svg
			>
		</button>
		<button
			class="absolute top-1/2 right-4 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-void/20 text-bone transition-opacity hover:bg-void/40 lg:group-hover:flex"
			onclick={nextImage}
			aria-label="Next image"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="lucide lucide-chevron-right"><path d="m9 18 6-6-6-6" /></svg
			>
		</button>
	</div>
</div>
