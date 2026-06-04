<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { uiStore, closeWishlistDrawer } from '$lib/client/modules/stores/ui';
	import { wishlist } from '$lib/client/modules/stores/wishlist.svelte';
	import Button from '../ui/Button.svelte';

	let wishlistItems = $state<any[]>([]);
	let isLoading = $state(false);

	// Watch allIds and wishlistDrawerOpen to fetch item details dynamically
	$effect(() => {
		const isOpen = $uiStore.wishlistDrawerOpen;
		const ids = wishlist.allIds;

		if (!isOpen) return;

		const fetchItems = async () => {
			isLoading = true;
			try {
				const query = ids.length > 0 ? `?ids=${ids.join(',')}` : '';
				const res = await fetch(`/api/wishlist${query}`);
				if (res.ok) {
					const data = (await res.json()) as { items?: any[] };
					wishlistItems = data.items || [];
				}
			} catch (err) {
				console.error('Failed to fetch wishlist item details:', err);
			} finally {
				isLoading = false;
			}
		};

		fetchItems();
	});

	async function handleRemove(productId: string) {
		await wishlist.toggle(productId);
		// Optimistically filter item out of local display array
		wishlistItems = wishlistItems.filter((item) => item.productId !== productId);
	}
</script>

{#if $uiStore.wishlistDrawerOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[54] bg-void/50"
		transition:fade={{ duration: 250 }}
		onclick={closeWishlistDrawer}
		onkeydown={(e) => e.key === 'Escape' && closeWishlistDrawer()}
		role="button"
		tabindex="0"
		aria-label="Close wishlist"
	></div>

	<!-- Drawer -->
	<div
		class="fixed top-0 right-0 z-[55] flex h-full w-full sm:w-[420px] flex-col border-l border-charcoal bg-void"
		transition:fly={{ x: 420, duration: 250 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-charcoal px-6 py-5">
			<div>
				<span class="font-display text-3xl text-bone uppercase">Your Wishlist</span>
				<span class="ml-2 font-mono text-xs text-ash">({wishlist.allIds.length})</span>
			</div>
			<button
				class="text-2xl font-light text-ash hover:text-bone cursor-pointer"
				onclick={closeWishlistDrawer}
			>
				×
			</button>
		</div>

		<!-- Item list -->
		<div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
			{#if isLoading}
				<div class="flex h-full flex-col items-center justify-center text-center">
					<span class="font-mono text-xs text-ash uppercase">Loading items...</span>
				</div>
			{:else if wishlistItems.length === 0}
				<div class="flex h-full flex-col items-center justify-center text-center">
					<span class="mb-2 font-display text-3xl text-bone">Wishlist is empty.</span>
					<span class="mb-6 font-mono text-xs tracking-widest text-ash/50 uppercase"
						>Find styles to save.</span
					>
					<Button variant="primary" onclick={closeWishlistDrawer} href="/shop?sort=new">
						Explore Shop →
					</Button>
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					{#each wishlistItems as item (item.id)}
						<div class="flex gap-4 border-b border-charcoal/50 pb-4">
							<a
								href="/shop/{item.product.slug}"
								onclick={closeWishlistDrawer}
								class="h-20 w-16 shrink-0 overflow-hidden bg-charcoal"
							>
								<img
									src={item.imageUrl || '/placeholder.png'}
									alt={item.product.name}
									class="h-full w-full object-cover object-top"
								/>
							</a>
							<div class="flex flex-1 flex-col justify-between">
								<div>
									<a
										href="/shop/{item.product.slug}"
										onclick={closeWishlistDrawer}
										class="font-sans text-sm font-medium text-bone hover:text-volt line-clamp-1"
									>
										{item.product.name}
									</a>
									<span class="mt-1 block font-mono text-xs text-ash">
										LKR {item.effectivePrice.toLocaleString()}
									</span>
								</div>
								<button
									onclick={() => handleRemove(item.productId)}
									class="w-fit font-mono text-[9px] tracking-widest text-ash/60 uppercase hover:text-volt cursor-pointer"
								>
									Remove
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Footer -->
		{#if wishlist.allIds.length > 0}
			<div class="border-t border-charcoal px-6 py-5">
				<Button variant="primary" class="w-full" href="/shop">Continue Shopping</Button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
