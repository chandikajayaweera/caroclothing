<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, ImageOff, Pencil, Star } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const product = $derived(data.product);
	const primaryImage = $derived(
		product.images.find((image) => image.isPrimary) ?? product.images[0] ?? null
	);
	const activeVariantCount = $derived(
		product.variants.filter((variant) => variant.isActive).length
	);

	function formatMoney(value: number): string {
		return `LKR ${value.toLocaleString('en-LK')}`;
	}

	function formatLabel(value: string): string {
		return value.replace(/_/g, ' ');
	}

	function formatDate(value: Date | string | null): string {
		if (!value) return 'None';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

<svelte:head>
	<title>{product.name} | Products | Caro Admin</title>
	<meta name="description" content={`View ${product.name} product details in Caro admin.`} />
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="border-b border-charcoal pb-6 md:pb-8">
		<a
			href={resolve('/app/products')}
			class="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-volt"
		>
			<ArrowLeft size={14} aria-hidden="true" />
			Products
		</a>

		<div class="mt-4 items-end justify-between gap-6 md:flex">
			<div class="min-w-0">
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Product view</p>
				<h1
					class="mt-2 truncate font-display text-5xl leading-none text-bone uppercase md:text-7xl"
				>
					{product.name}
				</h1>
				<p class="mt-2 truncate font-mono text-[10px] tracking-widest text-ash uppercase">
					{product.slug}
				</p>
			</div>

			<a
				href={resolve(`/app/products/${product.slug}/edit`)}
				class="mt-5 inline-flex min-h-11 items-center justify-center gap-2 bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone md:mt-0"
			>
				<Pencil size={14} aria-hidden="true" />
				Edit product
			</a>
		</div>
	</div>

	<div class="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
		<section class="border border-charcoal bg-charcoal/25">
			<div class="border-b border-charcoal p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Details</p>
				<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Catalog Data</h2>
			</div>

			<div class="grid gap-px bg-charcoal md:grid-cols-2">
				<div class="bg-void p-5">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">State</p>
					<p
						class="mt-2 font-mono text-xs tracking-widest uppercase {product.isActive
							? 'text-volt'
							: 'text-red-300'}"
					>
						{product.isActive ? 'Active' : 'Inactive'}
					</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Price</p>
					<p class="mt-2 font-mono text-xs text-bone">{formatMoney(product.basePrice)}</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Category</p>
					<p class="mt-2 font-mono text-xs text-bone">{product.category?.name ?? 'No category'}</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Tier</p>
					<p class="mt-2 font-mono text-xs text-bone">{formatLabel(product.tier)}</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Gender / Fit</p>
					<p class="mt-2 font-mono text-xs text-bone">
						{formatLabel(product.gender)} / {formatLabel(product.fit)}
					</p>
				</div>
				<div class="bg-void p-5">
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Drop</p>
					<p class="mt-2 font-mono text-xs text-bone">
						{product.dropAssignment?.name ?? 'No drop'}
					</p>
				</div>
			</div>

			<div class="grid gap-5 border-t border-charcoal p-5">
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Short description</p>
					<p class="mt-2 text-sm leading-6 text-bone">{product.shortDescription ?? 'None'}</p>
				</div>
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Description</p>
					<p class="mt-2 text-sm leading-6 whitespace-pre-wrap text-ash">
						{product.description ?? 'None'}
					</p>
				</div>
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Tags</p>
					{#if product.tags.length > 0}
						<div class="mt-3 flex flex-wrap gap-2">
							{#each product.tags as tag (tag.id)}
								<span
									class="border border-charcoal px-3 py-2 font-mono text-[10px] tracking-widest text-bone uppercase"
								>
									{tag.name}
								</span>
							{/each}
						</div>
					{:else}
						<p class="mt-2 font-mono text-[10px] text-ash uppercase">No tags</p>
					{/if}
				</div>
			</div>
		</section>

		<aside class="grid gap-4 xl:sticky xl:top-8 xl:self-start">
			<div class="border border-charcoal bg-void">
				{#if primaryImage}
					<img
						src={primaryImage.imageUrl}
						alt={primaryImage.altText ?? ''}
						class="aspect-[4/5] w-full object-cover"
					/>
				{:else}
					<div class="grid aspect-[4/5] place-items-center bg-charcoal/30 text-ash">
						<ImageOff size={28} aria-hidden="true" />
					</div>
				{/if}
				<div class="p-5">
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Counts</p>
					<div class="mt-4 grid grid-cols-3 gap-3 text-center">
						<div>
							<p class="font-display text-3xl text-bone uppercase">{product.images.length}</p>
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">Images</p>
						</div>
						<div>
							<p class="font-display text-3xl text-bone uppercase">{activeVariantCount}</p>
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">Live vars</p>
						</div>
						<div>
							<p class="font-display text-3xl text-bone uppercase">{product.tags.length}</p>
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">Tags</p>
						</div>
					</div>
				</div>
			</div>

			<div class="border border-charcoal bg-charcoal/25 p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Drop window</p>
				<div class="mt-4 grid gap-3 font-mono text-[10px] uppercase">
					<div class="flex justify-between gap-4">
						<span class="text-ash">Status</span>
						<span class="text-right text-bone">{product.dropAssignment?.status ?? 'None'}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-ash">Launch</span>
						<span class="text-right text-bone">
							{formatDate(product.dropAssignment?.launchAt ?? null)}
						</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-ash">End</span>
						<span class="text-right text-bone">
							{formatDate(product.dropAssignment?.endAt ?? null)}
						</span>
					</div>
				</div>
			</div>
		</aside>
	</div>

	<section class="mt-4 border border-charcoal bg-charcoal/25">
		<div class="border-b border-charcoal p-5">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Variants</p>
			<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Stock Options</h2>
		</div>

		{#if product.variants.length > 0}
			<div class="hidden overflow-x-auto md:block">
				<table class="w-full min-w-[760px] text-left">
					<thead class="border-b border-charcoal">
						<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
							<th class="px-5 py-4 font-normal">Size</th>
							<th class="px-5 py-4 font-normal">Color</th>
							<th class="px-5 py-4 font-normal">Price</th>
							<th class="px-5 py-4 font-normal">State</th>
						</tr>
					</thead>
					<tbody>
						{#each product.variants as variant (variant.id)}
							<tr class="border-b border-charcoal/70 last:border-b-0">
								<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">{variant.size}</td>
								<td class="px-5 py-4">
									<div class="flex items-center gap-2">
										{#if variant.colorHex}
											<span
												class="h-4 w-4 border border-charcoal"
												style:background={variant.colorHex}
												aria-hidden="true"
											></span>
										{/if}
										<span class="font-mono text-[10px] text-ash uppercase">{variant.color}</span>
									</div>
								</td>
								<td class="px-5 py-4 font-mono text-xs text-bone">
									{formatMoney(variant.effectivePrice)}
								</td>
								<td
									class="px-5 py-4 font-mono text-[10px] tracking-widest uppercase {variant.isActive
										? 'text-volt'
										: 'text-red-300'}"
								>
									{variant.isActive ? 'Active' : 'Off'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="divide-y divide-charcoal md:hidden">
				{#each product.variants as variant (variant.id)}
					<article class="p-4">
						<div class="flex items-start justify-between gap-4">
							<div>
								<p class="font-mono text-xs tracking-widest text-bone uppercase">
									{variant.size} / {variant.color}
								</p>
							</div>
							<span
								class="font-mono text-[10px] tracking-widest uppercase {variant.isActive
									? 'text-volt'
									: 'text-red-300'}"
							>
								{variant.isActive ? 'Active' : 'Off'}
							</span>
						</div>
						<p class="mt-3 font-mono text-xs text-bone">{formatMoney(variant.effectivePrice)}</p>
					</article>
				{/each}
			</div>
		{:else}
			<div class="p-10 text-center">
				<p class="font-display text-4xl text-bone uppercase">No variants</p>
				<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
					Add variants from edit.
				</p>
			</div>
		{/if}
	</section>

	<section class="mt-4 border border-charcoal bg-charcoal/25">
		<div class="border-b border-charcoal p-5">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Media</p>
			<h2 class="mt-2 font-display text-4xl leading-none text-bone uppercase">Images</h2>
		</div>

		{#if product.images.length > 0}
			<div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each product.images as image (image.id)}
					<article class="border border-charcoal bg-void">
						<div class="relative">
							<img
								src={image.imageUrl}
								alt={image.altText ?? ''}
								class="aspect-[4/5] w-full object-cover"
							/>
							{#if image.isPrimary}
								<span
									class="absolute top-2 left-2 inline-flex items-center gap-1 bg-volt px-2 py-1 font-mono text-[9px] tracking-widest text-void uppercase"
								>
									<Star size={12} aria-hidden="true" />
									Primary
								</span>
							{/if}
						</div>
						<div class="p-4">
							<p class="truncate font-mono text-[10px] text-ash uppercase">
								{image.altText ?? 'No alt text'}
							</p>
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<div class="p-10 text-center">
				<ImageOff size={28} class="mx-auto text-ash/50" aria-hidden="true" />
				<p class="mt-4 font-display text-4xl text-bone uppercase">No images</p>
			</div>
		{/if}
	</section>
</section>
