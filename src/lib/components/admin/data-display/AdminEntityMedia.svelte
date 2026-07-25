<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ComponentType, SvelteComponent } from 'svelte';

	type IconComponent = ComponentType<SvelteComponent>;

	let {
		href,
		src,
		alt = '',
		fallbackIcon: FallbackIcon,
		ariaLabel,
		aspect = 'video'
	}: {
		href: string;
		src?: string | null;
		alt?: string;
		fallbackIcon: IconComponent;
		ariaLabel?: string;
		aspect?: 'video' | 'portrait' | 'landscape';
	} = $props();

	const aspectClass = $derived(
		aspect === 'portrait' ? 'aspect-3/4' : aspect === 'landscape' ? 'aspect-4/3' : 'aspect-video'
	);
</script>

<a
	href={resolve(href as '/')}
	class="grid {aspectClass} w-full place-items-center border border-charcoal bg-charcoal/30"
	aria-label={ariaLabel}
>
	{#if src}
		<img {src} {alt} class="h-full w-full object-cover" />
	{:else}
		<FallbackIcon size={18} class="text-ash/50" aria-hidden="true" />
	{/if}
</a>
