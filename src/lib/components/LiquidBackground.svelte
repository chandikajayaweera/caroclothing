<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import model_1 from '$lib/assets/model_1.jpeg';
	import model_2 from '$lib/assets/model_2.jpeg';
	import model_3 from '$lib/assets/model_3.jpeg';

	let activeIndex = $state(0);
	const images = [model_1, model_2, model_3];

	onMount(() => {
		const interval = setInterval(() => {
			activeIndex = (activeIndex + 1) % images.length;
		}, 4000); // Crossfade every 4 seconds

		return () => clearInterval(interval);
	});
</script>

<div class="fixed inset-0 -z-10 overflow-hidden bg-background selection:bg-primary/10">
	<!-- Desktop Grid -->
	<div
		class="absolute inset-0 hidden grid-cols-2 gap-4 p-4 opacity-25 mix-blend-luminosity sm:grid lg:grid-cols-3"
	>
		<img src={model_1} class="h-full w-full rounded-3xl object-cover" alt="Model 1" />
		<img src={model_2} class="h-full w-full rounded-3xl object-cover" alt="Model 2" />
		<img
			src={model_3}
			class="hidden h-full w-full rounded-3xl object-cover lg:block"
			alt="Model 3"
		/>
	</div>

	<!-- Mobile Slideshow -->
	<div
		class="absolute inset-0 flex items-center justify-center p-2 opacity-25 mix-blend-luminosity sm:hidden"
	>
		{#key activeIndex}
			<img
				src={images[activeIndex]}
				in:fade={{ duration: 1200 }}
				out:fade={{ duration: 1200 }}
				class="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] rounded-xl object-cover"
				alt="Model slides"
			/>
		{/key}
	</div>

	<!-- Liquid Blobs -->

	<!-- Top Left Blob -->
	<div
		class="animate-blob absolute -top-[20%] -left-[10%] h-[50%] w-[50%] rounded-full bg-secondary/15 blur-[100px]"
	></div>

	<!-- Bottom Right Blob -->
	<div
		class="animate-blob animation-delay-2000 absolute -right-[10%] -bottom-[20%] h-[60%] w-[60%] rounded-full bg-primary/10 blur-[120px]"
	></div>

	<!-- Center Subtle Blob -->
	<div
		class="animate-blob animation-delay-4000 absolute top-[30%] left-[40%] h-[40%] w-[40%] rounded-full bg-secondary/8 blur-[80px]"
	></div>

	<!-- Noise Texture Overlay (Optional, adds to the raw/brutalist feel but keeps it premium) -->
	<div
		class="pointer-events-none absolute inset-0 opacity-[0.025] mix-blend-overlay"
		style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E');"
	></div>
</div>

<style>
	/* Use custom animation since standard tailwind doesn't have blob animation by default */
	@keyframes blob {
		0% {
			transform: translate(0px, 0px) scale(1);
		}
		33% {
			transform: translate(30px, -50px) scale(1.1);
		}
		66% {
			transform: translate(-20px, 20px) scale(0.9);
		}
		100% {
			transform: translate(0px, 0px) scale(1);
		}
	}

	.animate-blob {
		animation: blob 15s infinite alternate ease-in-out;
	}

	.animation-delay-2000 {
		animation-delay: 2s;
	}

	.animation-delay-4000 {
		animation-delay: 4s;
	}
</style>
