<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '../ui/Button.svelte';
	import { heroImageAttrs, heroMobileImageAttrs } from '$lib/shared/media';
	import type { StorefrontSectionBaseDTO } from '$lib/server/modules/storefront/storefront.types';

	let { section }: { section: StorefrontSectionBaseDTO } = $props();
	let scrollY = $state(0);
	const desktop = $derived(section.media.find((item) => item.role === 'desktop') ?? null);
	const mobile = $derived(section.media.find((item) => item.role === 'mobile') ?? desktop);
	const desktopAttrs = $derived(desktop ? heroImageAttrs(desktop, { priority: true }) : null);
	const mobileAttrs = $derived(mobile ? heroMobileImageAttrs(mobile, { priority: true }) : null);

	onMount(() => {
		const handleScroll = () => {
			if (window.innerWidth >= 768) scrollY = window.scrollY;
		};
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<section
	class="relative flex min-h-[78svh] flex-col justify-end overflow-hidden md:min-h-screen"
	style="--scroll-y: {scrollY}"
>
	{#if desktopAttrs || mobileAttrs}
		<picture class="absolute inset-0">
			{#if mobileAttrs}<source media="(max-width: 767px)" srcset={mobileAttrs.src} />{/if}
			{#if desktopAttrs}
				<img
					src={desktopAttrs.src}
					srcset={desktopAttrs.srcset || undefined}
					sizes={desktopAttrs.sizes}
					width={desktopAttrs.width}
					height={desktopAttrs.height}
					loading="eager"
					fetchpriority="high"
					alt={desktop?.altText ?? section.title ?? 'Caro Clothing'}
					class="hero-image h-full w-full object-cover"
					style="--mobile-x: {mobile?.focalX ?? 50}%; --mobile-y: {mobile?.focalY ??
						50}%; --desktop-x: {desktop?.focalX ?? 50}%; --desktop-y: {desktop?.focalY ?? 50}%"
				/>
			{:else if mobileAttrs}
				<img
					src={mobileAttrs.src}
					alt={mobile?.altText ?? section.title ?? 'Caro Clothing'}
					class="h-full w-full object-cover"
				/>
			{/if}
		</picture>
	{:else}
		<div
			class="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(200,255,0,0.16),transparent_40%),linear-gradient(135deg,#1c1c1c,#0a0a0a_70%)]"
		></div>
	{/if}
	<div class="absolute inset-0 bg-linear-to-t from-void via-void/45 to-transparent"></div>
	<div class="relative z-10 px-5 pb-12 md:px-10 md:pb-16 lg:px-16 lg:pb-20">
		{#if section.eyebrow}<span
				class="mb-4 block font-mono text-[10px] tracking-[0.2em] text-volt uppercase"
				>{section.eyebrow}</span
			>{/if}
		<h1
			class="max-w-5xl font-display text-[58px] leading-[0.88] text-bone uppercase md:text-[104px] lg:text-[142px]"
		>
			{section.title ?? 'Wear the next generation'}
		</h1>
		{#if section.body}<p
				class="mt-5 max-w-xl font-mono text-[10px] tracking-widest text-ash uppercase md:text-xs"
			>
				{section.body}
			</p>{/if}
		<div class="mt-8 flex flex-wrap gap-3">
			{#if section.primaryCtaLabel && section.primaryCtaUrl}<Button
					variant="primary"
					href={section.primaryCtaUrl}
					class="bg-volt px-10 py-4 text-void hover:bg-bone">{section.primaryCtaLabel}</Button
				>{/if}
			{#if section.secondaryCtaLabel && section.secondaryCtaUrl}<Button
					variant="outline"
					href={section.secondaryCtaUrl}>{section.secondaryCtaLabel}</Button
				>{/if}
		</div>
	</div>
</section>

<style>
	.hero-image {
		transform: none;
		object-position: var(--mobile-x) var(--mobile-y);
	}
	@media (min-width: 768px) {
		.hero-image {
			transform: translateY(calc(var(--scroll-y) * 0.15px)) scale(1.04);
			object-position: var(--desktop-x) var(--desktop-y);
		}
	}
</style>
