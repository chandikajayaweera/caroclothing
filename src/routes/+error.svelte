<script lang="ts">
	import { page } from '$app/state';

	const isNotFound = $derived(page.status === 404);
	const statusCode = $derived(String(page.status ?? 500));
	const title = $derived(isNotFound ? 'Page Not Found' : 'Page Hit A Snag');
	const eyebrow = $derived(isNotFound ? 'Route missing' : 'Store error');
	const headline = $derived(isNotFound ? 'This page is off the rack.' : 'Something broke.');
	const body = $derived(
		isNotFound
			? 'The link is wrong, moved, or sold out of existence. Head back to the rails.'
			: 'The store did not load clean. Try again or get back to shopping.'
	);
	const primaryHref = $derived(isNotFound ? '/shop' : '/');
	const primaryLabel = $derived(isNotFound ? 'Shop Now' : 'Go Home');
	const secondaryHref = $derived(isNotFound ? '/' : '/shop');
	const secondaryLabel = $derived(isNotFound ? 'Go Home' : 'Shop Now');
</script>

<svelte:head>
	<title>{title} | Caro Clothing</title>
	<meta name="description" content={body} />
</svelte:head>

<section
	class="relative min-h-[calc(100svh-60px-env(safe-area-inset-bottom))] overflow-hidden bg-void px-4 pt-12 pb-8 md:min-h-screen md:px-8 md:pt-24 md:pb-28 lg:px-12 lg:pt-28"
>
	<div
		class="pointer-events-none absolute inset-0 opacity-[0.035] md:opacity-[0.05]"
		style="background-image: linear-gradient(to right, #f8f5f0 1px, transparent 1px), linear-gradient(to bottom, #f8f5f0 1px, transparent 1px); background-size: 32px 32px;"
	></div>

	<div
		class="relative mx-auto grid min-h-[calc(100svh-140px-env(safe-area-inset-bottom))] max-w-7xl items-center gap-8 md:min-h-[calc(100vh-220px)] lg:grid-cols-[1fr_360px] lg:gap-10"
	>
		<div class="max-w-4xl">
			<div
				class="mb-6 flex items-center gap-3 font-mono text-[10px] tracking-[0.2em] text-volt uppercase"
			>
				<span>{eyebrow}</span>
				<span class="h-px w-10 bg-volt"></span>
				<span>{statusCode}</span>
			</div>

			<div class="mb-5 py-4 md:hidden">
				<div class="flex items-end justify-between gap-4">
					<span class="font-display text-7xl leading-none text-bone/20">{statusCode}</span>
					<span class="pb-2 text-right font-mono text-[9px] tracking-widest text-ash uppercase">
						{isNotFound ? 'Find another fit' : 'Reload or restart'}
					</span>
				</div>
			</div>

			<h1
				class="font-display text-6xl leading-[0.9] text-bone uppercase sm:text-7xl md:text-9xl lg:text-[160px]"
			>
				{headline}
			</h1>

			<p class="mt-5 max-w-xl font-sans text-sm leading-6 text-ash md:mt-6 md:text-lg md:leading-7">
				{body}
			</p>

			<div class="mt-8 flex flex-col gap-3 sm:flex-row md:mt-10">
				<a
					href={primaryHref}
					class="bg-volt px-8 py-4 text-center font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone"
				>
					{primaryLabel}
				</a>
				<a
					href={secondaryHref}
					class="border border-ash/30 px-8 py-4 text-center font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
				>
					{secondaryLabel}
				</a>
			</div>
		</div>

		<aside
			class="hidden border-y border-charcoal py-8 md:block lg:border-y-0 lg:border-l lg:py-0 lg:pl-8"
		>
			<div
				class="font-display text-[120px] leading-none text-bone/10 md:text-[180px] lg:text-[220px]"
			>
				{statusCode}
			</div>
			<div class="mt-2 grid grid-cols-2 gap-px bg-charcoal">
				<div class="bg-void p-4">
					<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Status</span>
					<p class="mt-2 font-display text-3xl text-bone uppercase">{statusCode}</p>
				</div>
				<div class="bg-void p-4">
					<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Store</span>
					<p class="mt-2 font-display text-3xl text-bone uppercase">Caro</p>
				</div>
				<div class="col-span-2 bg-void p-4">
					<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Next move</span>
					<p class="mt-2 font-mono text-xs tracking-widest text-volt uppercase">
						{isNotFound ? 'Find another fit' : 'Reload or restart'}
					</p>
				</div>
			</div>
		</aside>
	</div>
</section>
