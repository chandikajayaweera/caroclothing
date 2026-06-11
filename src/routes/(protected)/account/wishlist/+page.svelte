<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Dialog } from 'bits-ui';
	import { Heart, Trash2 } from 'lucide-svelte';
	import ProductCard from '$lib/components/product/ProductCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let clearOpen = $state(false);
	let pendingItemId = $state<string | null>(null);
	let clearing = $state(false);

	const wishlistItems = $derived(data.wishlist.items);

	function enhanceRemove(itemId: string): SubmitFunction {
		return () => {
			pendingItemId = itemId;
			return async ({ update }) => {
				await update();
				pendingItemId = null;
			};
		};
	}

	const enhanceClear: SubmitFunction = () => {
		clearing = true;
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') clearOpen = false;
			clearing = false;
		};
	};
</script>

<svelte:head>
	<title>Wishlist | Caro Clothing</title>
	<meta name="description" content="Manage your saved Caro pieces" />
</svelte:head>

<div class="space-y-8">
	<header
		class="flex flex-col gap-5 border-b border-charcoal pb-6 sm:flex-row sm:items-end sm:justify-between"
	>
		<div>
			<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">Saved pieces</p>
			<h2 class="mt-2 font-display text-4xl leading-none uppercase sm:text-5xl">Wishlist.</h2>
			<p class="mt-3 text-sm text-ash">{data.wishlist.total} pieces saved.</p>
		</div>
		{#if wishlistItems.length > 0}
			<button
				type="button"
				onclick={() => (clearOpen = true)}
				class="flex min-h-11 w-full items-center justify-center gap-2 border border-red-400/30 px-4 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:border-red-300 hover:text-red-200 sm:w-auto"
			>
				<Trash2 size={14} aria-hidden="true" />
				Clear wishlist
			</button>
		{/if}
	</header>

	<div class="grid grid-cols-1 gap-x-3 gap-y-10 min-[480px]:grid-cols-2 sm:grid-cols-3 md:gap-x-6">
		{#each wishlistItems as item (item.id)}
			{@const cardProduct = {
				id: item.product.id,
				name: item.product.name,
				slug: item.product.slug,
				tier: item.product.tier,
				primaryImage: item.imageUrl || item.product.imageUrl || '/placeholder.png',
				price: item.effectivePrice,
				compareAtPrice: item.product.compareAtPrice,
				variants: item.variant ? [item.variant] : []
			}}
			<article class="min-w-0">
				<ProductCard product={cardProduct} />
				<div class="mt-3 flex items-center justify-between gap-2">
					<span
						class="font-mono text-[8px] tracking-widest uppercase {item.stockStatus === 'sold-out'
							? 'text-red-300'
							: item.stockStatus === 'low-stock'
								? 'text-amber-300'
								: 'text-volt'}"
					>
						{item.stockStatus === 'sold-out'
							? 'Sold out'
							: item.stockStatus === 'low-stock'
								? 'Low stock'
								: 'Available'}
					</span>
					<form method="POST" action="?/remove" use:enhance={enhanceRemove(item.id)}>
						<input type="hidden" name="productId" value={item.productId} />
						<input type="hidden" name="variantId" value={item.variantId || ''} />
						<button
							type="submit"
							disabled={pendingItemId === item.id}
							class="min-h-11 px-3 font-mono text-[8px] tracking-widest text-ash uppercase hover:text-red-300"
							aria-label={`Remove ${item.product.name} from wishlist`}
						>
							{pendingItemId === item.id ? 'Removing...' : 'Remove'}
						</button>
					</form>
				</div>
			</article>
		{:else}
			<div class="col-span-full border border-dashed border-charcoal py-20 text-center">
				<Heart class="mx-auto text-ash/50" size={30} aria-hidden="true" />
				<h3 class="mt-4 font-display text-3xl uppercase">Nothing saved yet.</h3>
				<p class="mt-2 text-sm text-ash">Keep the pieces you want close.</p>
				<a
					href={resolve('/shop')}
					class="mt-6 inline-flex min-h-11 items-center bg-volt px-6 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone"
				>
					Explore shop
				</a>
			</div>
		{/each}
	</div>
</div>

<Dialog.Root bind:open={clearOpen}>
	{#if clearOpen}
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-50 bg-void/90" />
			<div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto px-4 py-6">
				<Dialog.Content
					class="w-full max-w-md border border-red-400/30 bg-charcoal p-6 outline-none"
				>
					<Dialog.Title class="font-display text-3xl uppercase">Clear wishlist?</Dialog.Title>
					<Dialog.Description class="mt-3 text-sm text-ash">
						Every saved item will be removed.
					</Dialog.Description>
					<form
						method="POST"
						action="?/clear"
						use:enhance={enhanceClear}
						class="mt-6 grid gap-3 sm:grid-cols-2"
					>
						<button
							type="submit"
							disabled={clearing}
							class="min-h-11 bg-red-400 px-4 font-mono text-[9px] tracking-widest text-void uppercase hover:bg-red-300"
						>
							{clearing ? 'Clearing...' : 'Clear all'}
						</button>
						<button
							type="button"
							onclick={() => (clearOpen = false)}
							disabled={clearing}
							class="min-h-11 border border-ash/30 px-4 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone"
						>
							Cancel
						</button>
					</form>
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
