<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
</script>

<div class="flex flex-col items-center text-center max-w-3xl mx-auto">
		<h1 
			in:fly={{ y: 30, duration: 800, delay: 100, easing: cubicOut }}
			class="text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight text-primary leading-[1.1]"
		>
			ELEVATING
			<br />
			<span class="text-secondary/70 italic font-normal">EVERYDAY</span>
			<br />
			LUXURY.
		</h1>
		
		<p 
			in:fly={{ y: 20, duration: 800, delay: 300, easing: cubicOut }}
			class="mt-4 md:mt-8 text-base md:text-lg lg:text-xl text-secondary/80 max-w-xl font-light tracking-wide leading-relaxed px-2"
		>
			Caro Clothing redefines modern apparel with minimalist aesthetics and uncompromising quality. A new era of fashion is loading.
		</p>
</div>
