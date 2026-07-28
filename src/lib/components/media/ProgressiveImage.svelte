<script lang="ts">
	import { onMount } from 'svelte';
	import type { HTMLImgAttributes } from 'svelte/elements';
	import SkeletonBlock from '$lib/components/navigation/SkeletonBlock.svelte';

	type Props = Omit<HTMLImgAttributes, 'src' | 'alt' | 'class' | 'onload' | 'onerror'> & {
		src: string;
		alt: string;
		class?: string;
		skeletonClass?: string;
		showSkeleton?: boolean;
	};

	let {
		src,
		alt,
		class: className = '',
		skeletonClass = 'absolute inset-0 h-full w-full',
		showSkeleton = true,
		...imageAttributes
	}: Props = $props();

	let imageElement: HTMLImageElement | undefined = $state();
	let loadedSrc: string | null = $state(null);
	let failedSrc: string | null = $state(null);

	const loaded = $derived(loadedSrc === src);
	const failed = $derived(failedSrc === src);
	const pending = $derived(!loaded && !failed);
	const skeletonPending = $derived(showSkeleton && pending);

	function markLoaded() {
		loadedSrc = src;
		failedSrc = null;
	}

	function markFailed() {
		failedSrc = src;
		loadedSrc = null;
	}

	onMount(() => {
		if (!imageElement?.complete) return;
		if (imageElement.naturalWidth > 0) markLoaded();
		else markFailed();
	});
</script>

{#if skeletonPending}
	<SkeletonBlock class={skeletonClass} />
{/if}

<img
	{...imageAttributes}
	bind:this={imageElement}
	{src}
	{alt}
	aria-busy={skeletonPending}
	onload={markLoaded}
	onerror={markFailed}
	class="progressive-image {className}"
	class:progressive-image--pending={skeletonPending}
/>

<style>
	.progressive-image {
		transition: opacity 180ms ease-out;
	}

	.progressive-image--pending {
		opacity: 0 !important;
	}

	@media (prefers-reduced-motion: reduce) {
		.progressive-image {
			transition: none;
		}
	}
</style>
