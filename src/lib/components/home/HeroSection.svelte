<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../ui/Button.svelte';
	import type { DropDTO } from '$lib/server/modules/drops/drops.types';

	interface Props {
		featuredDrop?: DropDTO | null;
	}

	let { featuredDrop = null }: Props = $props();

	// Determine mode dynamically based on featuredDrop
	const mode = $derived.by(() => {
		if (!featuredDrop) return 'default';
		if (featuredDrop.status === 'live') return 'drop-live';
		if (featuredDrop.status === 'teaser') return 'drop-coming';
		return 'default';
	});

	// Countdown timer state
	let timeLeft = $state({ days: 0, hours: 0, minutes: 0, seconds: 0 });

	$effect(() => {
		if (mode !== 'drop-coming' || !featuredDrop?.launchAt) return;

		const launchDate = new Date(featuredDrop.launchAt);

		const updateTimer = () => {
			const now = new Date();
			const difference = launchDate.getTime() - now.getTime();

			if (difference <= 0) {
				timeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };
				return;
			}

			timeLeft = {
				days: Math.floor(difference / (1000 * 60 * 60 * 24)),
				hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
				minutes: Math.floor((difference / 1000 / 60) % 60),
				seconds: Math.floor((difference / 1000) % 60)
			};
		};

		updateTimer();
		const interval = setInterval(updateTimer, 1000);
		return () => clearInterval(interval);
	});

	const hero = $derived.by(() => {
		const baseImg = featuredDrop?.heroImageUrl || '/images/hero.jpg';

		if (mode === 'drop-live' && featuredDrop) {
			return {
				tag: `${featuredDrop.name} — LIVE NOW`,
				headline: [featuredDrop.name, 'IS HERE', 'SHOP NOW'],
				subline: featuredDrop.tagline || 'Limited stock. Ships from Colombo.',
				cta: { label: `Shop ${featuredDrop.name} →`, href: `/drops/${featuredDrop.slug}` },
				image: baseImg
			};
		}

		if (mode === 'drop-coming' && featuredDrop) {
			const launchDateStr = featuredDrop.launchAt
				? new Date(featuredDrop.launchAt).toLocaleDateString('en-US', {
						month: 'long',
						day: 'numeric'
					})
				: 'SOON';
			return {
				tag: `${featuredDrop.name} — COMING ${launchDateStr.toUpperCase()}`,
				headline: [featuredDrop.name, 'LAUNCHING', 'SOON'],
				subline: featuredDrop.tagline || 'Get notified when it drops.',
				cta: { label: 'Notify Me', href: `/drops/${featuredDrop.slug}` },
				image: baseImg
			};
		}

		return {
			tag: 'NEW IN',
			headline: ['WEAR THE', 'NEXT', 'GENERATION'],
			subline: 'New arrivals. Limited stock.',
			cta: { label: 'Shop New In →', href: '/shop?sort=new' },
			image: '/images/hero.jpg'
		};
	});

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
	<!-- Background -->
	<img
		src={hero.image}
		alt="Hero"
		class="hero-image absolute inset-0 h-full w-full object-cover object-top"
	/>

	<!-- Gradient overlay -->
	<div class="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent"></div>

	<!-- Content -->
	<div class="relative z-10 px-5 pb-10 md:px-10 md:pb-16 lg:px-16 lg:pb-20">
		<span class="mb-4 block font-mono text-[10px] tracking-[0.2em] text-volt uppercase">
			{hero.tag}
		</span>

		<h1
			class="font-display text-[56px] leading-[0.88] text-bone uppercase md:text-[100px] lg:text-[140px] lg:leading-[0.85]"
		>
			{#each hero.headline as line, i}
				<span class="block {i === 1 && mode === 'default' ? 'text-volt' : ''}">{line}</span>
			{/each}
		</h1>

		{#if mode === 'drop-coming' && featuredDrop?.launchAt}
			<div class="mt-6 flex gap-4 font-mono text-bone">
				<div class="flex flex-col">
					<span class="text-2xl font-bold md:text-3xl"
						>{timeLeft.days.toString().padStart(2, '0')}</span
					>
					<span class="text-[8px] tracking-widest text-ash uppercase">Days</span>
				</div>
				<div class="flex flex-col">
					<span class="text-2xl font-bold md:text-3xl"
						>{timeLeft.hours.toString().padStart(2, '0')}</span
					>
					<span class="text-[8px] tracking-widest text-ash uppercase">Hrs</span>
				</div>
				<div class="flex flex-col">
					<span class="text-2xl font-bold md:text-3xl"
						>{timeLeft.minutes.toString().padStart(2, '0')}</span
					>
					<span class="text-[8px] tracking-widest text-ash uppercase">Mins</span>
				</div>
				<div class="flex flex-col">
					<span class="text-2xl font-bold md:text-3xl"
						>{timeLeft.seconds.toString().padStart(2, '0')}</span
					>
					<span class="text-[8px] tracking-widest text-ash uppercase">Secs</span>
				</div>
			</div>
		{/if}

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
