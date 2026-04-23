<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../ui/Button.svelte';

	const hero = {
		tag: 'Drop 001 — Live Now',
		headline: ['WEAR THE', 'NEXT', 'GENERATION'],
		subline: 'New arrivals. Limited stock.',
		cta: { label: 'Shop the Drop', href: '/shop?sort=new' },
		image: '/images/hero.png'
	};

	let scrollY = $state(0);

	onMount(() => {
		const handleScroll = () => {
			// Strictly only update scrollY for desktop to avoid any mobile re-renders
			if (window.innerWidth >= 768) {
				scrollY = window.scrollY;
			}
		};
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<section
	class="hero-container relative h-[calc(100svh-60px-env(safe-area-inset-bottom))] md:h-screen md:min-h-screen flex flex-col justify-end overflow-hidden"
	style="--scroll-y: {scrollY}"
>
	<!-- Background -->
	<img
		src={hero.image}
		alt="Hero"
		class="hero-image absolute inset-0 w-full h-full object-cover object-top"
	/>

	<!-- Gradient overlay -->
	<div class="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent"></div>

	<!-- Content -->
	<div class="relative z-10 px-5 pb-10 md:px-10 md:pb-16 lg:px-16 lg:pb-20">
		<span class="font-mono text-[10px] text-volt uppercase tracking-[0.2em] mb-4 block">
			{hero.tag}
		</span>

		<h1 class="font-display text-[64px] md:text-[110px] lg:text-[160px] leading-[0.88] lg:leading-[0.85] text-bone uppercase">
			{#each hero.headline as line, i}
				<span class="block {i === 1 ? 'text-volt' : ''}">{line}</span>
			{/each}
		</h1>

		<p class="font-mono text-[10px] md:text-xs text-ash mt-4 max-w-xs">
			{hero.subline}
		</p>

		<Button variant="primary" href={hero.cta.href} class="mt-6">
			{hero.cta.label}
		</Button>
	</div>
</section>

<style>
	.hero-image {
		transform: none !important;
		transition: none !important;
	}

	@media (min-width: 768px) {
		.hero-image {
			transform: translateY(calc(var(--scroll-y) * 0.15px)) !important;
		}
	}
</style>
