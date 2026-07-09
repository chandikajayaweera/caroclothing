<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../ui/Button.svelte';

	const hero = {
		tag: 'NEW IN',
		headline: ['WEAR THE', 'NEXT', 'GENERATION'],
		subline: 'New arrivals. Limited stock.',
		cta: { label: 'Shop New In ->', href: '/shop?sort=new' },
		image: '/images/hero.jpg'
	};

	let scrollY = $state(0);

	onMount(() => {
		const handleScroll = () => {
			if (window.innerWidth >= 768) {
				scrollY = window.scrollY;
			}
		};
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<section
	class="hero-container relative flex h-[calc(100svh-60px-env(safe-area-inset-bottom))] flex-col justify-end overflow-hidden md:h-screen md:min-h-screen"
	style="--scroll-y: {scrollY}"
>
	<img
		src={hero.image}
		alt="Caro Clothing editorial hero"
		class="hero-image absolute inset-0 h-full w-full object-cover object-top"
	/>

	<div class="absolute inset-0 bg-linear-to-t from-void via-void/40 to-transparent"></div>

	<div class="relative z-10 px-5 pb-10 md:px-10 md:pb-16 lg:px-16 lg:pb-20">
		<span class="mb-4 block font-mono text-[10px] tracking-[0.2em] text-volt uppercase">
			{hero.tag}
		</span>

		<h1
			class="font-display text-[56px] leading-[0.88] text-bone uppercase md:text-[100px] lg:text-[140px] lg:leading-[0.85]"
		>
			{#each hero.headline as line, i (line)}
				<span class="block {i === 1 ? 'text-volt' : ''}">{line}</span>
			{/each}
		</h1>

		<p class="mt-4 max-w-xs font-mono text-[10px] tracking-widest text-ash uppercase md:text-xs">
			{hero.subline}
		</p>

		<Button
			variant="primary"
			href={hero.cta.href}
			class="mt-8 bg-volt px-10 py-4 text-void hover:bg-bone"
		>
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
