<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import HeroSection from './HeroSection.svelte';
	import SocialProofRail from './SocialProofRail.svelte';
	import ProductCard from '$lib/components/product/ProductCard.svelte';
	import type { HomePageSectionDTO } from '$lib/server/modules/storefront/storefront.types';
	import { mediaPresetUrl } from '$lib/shared/media';

	let { section }: { section: HomePageSectionDTO } = $props();
	const desktopMedia = $derived(
		section.media.find((item) => item.role === 'desktop') ?? section.media[0] ?? null
	);
	const heading = $derived(section.title ?? section.adminName);
</script>

{#if section.type === 'hero'}
	<HeroSection {section} />
{:else if section.type === 'product_grid' && section.products.length > 0}
	<section class="bg-void px-4 py-14 md:px-6 lg:px-8 lg:py-24">
		<div class="mx-auto max-w-7xl">
			<header class="mb-8 flex items-end justify-between gap-6">
				<div>
					{#if section.eyebrow}<p
							class="mb-2 font-mono text-[10px] tracking-[0.2em] text-volt uppercase"
						>
							{section.eyebrow}
						</p>{/if}
					<h2 class="font-display text-5xl text-bone uppercase md:text-7xl lg:text-8xl">
						{heading}
					</h2>
				</div>
				{#if section.primaryCtaLabel && section.primaryCtaUrl}<a
						href={resolve(section.primaryCtaUrl as '/')}
						class="shrink-0 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-volt"
						>[{section.primaryCtaLabel}]</a
					>{/if}
			</header>
			<div class="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-4">
				{#each section.products as product (product.id)}<ProductCard {product} />{/each}
			</div>
		</div>
	</section>
{:else if section.type === 'product_spotlight' && section.product}
	<section class="grid bg-charcoal lg:min-h-[680px] lg:grid-cols-2">
		<div class="relative min-h-[460px] overflow-hidden lg:min-h-full">
			<img
				src={section.product.primaryImageUrl ?? '/images/placeholder.jpg'}
				alt={section.product.name}
				class="absolute inset-0 h-full w-full object-cover object-top"
			/>
		</div>
		<div class="flex flex-col justify-center px-6 py-16 md:px-12 lg:px-16">
			{#if section.eyebrow}<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">
					{section.eyebrow}
				</p>{/if}
			<h2 class="mt-3 font-display text-6xl leading-[0.9] text-bone uppercase md:text-8xl">
				{section.title ?? section.product.name}
			</h2>
			<p class="mt-6 max-w-lg text-sm leading-7 text-ash">
				{section.body ?? section.product.shortDescription ?? section.product.description}
			</p>
			<a
				href={resolve((section.primaryCtaUrl ?? `/shop/${section.product.slug}`) as '/')}
				class="mt-8 inline-flex w-fit items-center gap-2 border border-ash/30 px-6 py-3 font-mono text-[10px] tracking-widest text-bone uppercase hover:border-volt hover:text-volt"
				>{section.primaryCtaLabel ?? 'Shop the look'} <ArrowUpRight size={14} /></a
			>
		</div>
	</section>
{:else if section.type === 'category_showcase' && section.categories.length > 0}
	<section class="bg-bone px-4 py-16 text-void md:px-8 lg:py-24">
		<div class="mx-auto max-w-7xl">
			<header class="mb-9">
				<p class="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60">
					{section.eyebrow ?? 'Shop by category'}
				</p>
				<h2 class="mt-2 font-display text-6xl uppercase md:text-8xl">{heading}</h2>
			</header>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#each section.categories as category (category.id)}
					<a
						href={resolve(`/shop?category=${category.slug}`)}
						class="group relative min-h-72 overflow-hidden bg-charcoal"
					>
						{#if category.imageR2Key}<img
								src={mediaPresetUrl(category.imageR2Key, 'card600')}
								alt={category.name}
								class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
							/>{/if}
						<div
							class="absolute inset-0 bg-linear-to-t from-void via-transparent to-transparent"
						></div>
						<span
							class="absolute right-5 bottom-5 left-5 flex items-center justify-between font-display text-4xl text-bone uppercase"
							>{category.name}<ArrowUpRight size={22} /></span
						>
					</a>
				{/each}
			</div>
		</div>
	</section>
{:else if section.type === 'promotion_campaign' && section.promotion}
	<section class="relative overflow-hidden bg-volt px-5 py-20 text-void md:px-10 lg:py-28">
		{#if desktopMedia}<img
				src={desktopMedia.imageUrl}
				alt={desktopMedia.altText ?? ''}
				class="absolute inset-0 h-full w-full object-cover opacity-20"
			/>{/if}
		<div class="relative mx-auto max-w-7xl">
			<p class="font-mono text-[10px] font-bold tracking-[0.2em] uppercase">
				{section.eyebrow ?? 'Limited offer'}
			</p>
			<h2 class="mt-3 max-w-5xl font-display text-6xl leading-[0.9] uppercase md:text-9xl">
				{section.title ?? section.promotion.title}
			</h2>
			<p class="mt-5 max-w-xl text-sm font-medium">
				{section.body ?? section.promotion.description}
			</p>
			{#if section.primaryCtaLabel && section.primaryCtaUrl}<a
					href={resolve(section.primaryCtaUrl as '/')}
					class="mt-8 inline-flex bg-void px-7 py-4 font-mono text-[10px] font-bold tracking-widest text-bone uppercase"
					>{section.primaryCtaLabel}</a
				>{/if}
		</div>
	</section>
{:else if section.type === 'service_strip'}
	<section class="border-y border-charcoal bg-void px-5 py-8">
		<div class="mx-auto flex max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-center">
			<div>
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">
					{section.eyebrow ?? 'Caro service'}
				</p>
				<h2 class="mt-1 font-display text-4xl text-bone uppercase">
					{section.title ?? section.shipping?.name ?? 'Island-wide delivery'}
				</h2>
			</div>
			<p class="max-w-xl text-sm text-ash">
				{section.body ?? section.shipping?.description ?? section.shipping?.etaText}
			</p>
			{#if section.primaryCtaLabel && section.primaryCtaUrl}<a
					href={resolve(section.primaryCtaUrl as '/')}
					class="font-mono text-[10px] tracking-widest text-bone uppercase hover:text-volt"
					>{section.primaryCtaLabel} →</a
				>{/if}
		</div>
	</section>
{:else if section.type === 'review_rail' && section.reviews.length > 0}
	<SocialProofRail reviews={section.reviews} />
{/if}
