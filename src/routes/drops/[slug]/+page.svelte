<script lang="ts">
	import { enhance } from '$app/forms';
	import CountdownTimer from '$lib/components/drops/CountdownTimer.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProductCard from '$lib/components/product/ProductCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const drop = $derived(data.drop);
	const products = $derived(
		data.drop.products.map((p) => p.product).filter((p): p is NonNullable<typeof p> => p !== null)
	);
	const launchDate = $derived(drop.launchAt ? new Date(drop.launchAt) : null);

	let contactVal = $state('');
	let waitlistSuccess = $state(false);
	let waitlistMessage = $state('');
</script>

<svelte:head>
	<title>{drop.name} | Caro Clothing</title>
	{#if drop.description}
		<meta name="description" content={drop.description} />
	{/if}
</svelte:head>

{#if drop.status === 'teaser'}
	<!-- Upcoming countdown view -->
	<div
		class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-void"
	>
		<!-- Background -->
		<div class="absolute inset-0">
			{#if drop.heroImageUrl}
				<img src={drop.heroImageUrl} alt="" class="h-full w-full object-cover opacity-20" />
			{/if}
			<div class="absolute inset-0 bg-gradient-to-b from-void/90 via-transparent to-void/90"></div>
		</div>

		<!-- Content -->
		<div class="relative z-10 flex flex-col items-center px-5 text-center">
			<span class="mb-6 font-mono text-[10px] tracking-[0.3em] text-volt uppercase">
				Upcoming Drop
			</span>

			<h1
				class="max-w-4xl font-display text-[60px] leading-[0.88] text-bone uppercase md:text-[100px] lg:text-[140px]"
			>
				{drop.name}
			</h1>

			{#if drop.tagline}
				<p class="mt-4 max-w-md font-sans text-sm tracking-wider text-ash uppercase md:text-base">
					{drop.tagline}
				</p>
			{/if}

			{#if launchDate}
				<div class="mt-12">
					<CountdownTimer targetDate={launchDate} />
				</div>
			{/if}

			{#if waitlistSuccess}
				<div class="mt-12 max-w-sm border border-volt/20 bg-volt/5 px-6 py-4">
					<p class="font-mono text-xs text-volt uppercase">{waitlistMessage}</p>
				</div>
			{:else}
				<form
					method="POST"
					action="?/joinWaitlist"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								const data = result.data as any;
								waitlistSuccess = true;
								waitlistMessage = data?.message || 'Joined waitlist successfully!';
							}
						};
					}}
					class="mt-12 flex w-full max-w-sm flex-col gap-2 sm:flex-row"
				>
					<input type="hidden" name="dropId" value={drop.id} />
					<input
						type="text"
						name="contact"
						bind:value={contactVal}
						required
						placeholder="PHONE OR EMAIL"
						class="flex-1 border border-ash/40 bg-transparent px-4 py-3 font-mono text-sm text-bone uppercase transition-colors outline-none placeholder:text-ash/40 focus:border-volt"
					/>
					<Button variant="primary" type="submit" class="px-8 py-3">Notify Me</Button>
				</form>
			{/if}
		</div>
	</div>
{:else}
	<!-- Live / Archived drop catalog view -->
	<div class="min-h-screen bg-void pt-24 pb-20 text-bone">
		<div class="mx-auto max-w-7xl px-4 md:px-8">
			<!-- Hero Header -->
			<div
				class="relative mb-16 overflow-hidden border border-charcoal bg-charcoal/30 p-8 md:p-12 lg:p-16"
			>
				{#if drop.heroImageUrl}
					<div class="absolute inset-0 z-0">
						<img src={drop.heroImageUrl} alt="" class="h-full w-full object-cover opacity-15" />
						<div class="absolute inset-0 bg-gradient-to-r from-void via-transparent to-void"></div>
					</div>
				{/if}

				<div class="relative z-10 max-w-2xl">
					<div class="mb-4 flex items-center gap-3">
						<span class="font-mono text-[9px] tracking-widest text-volt uppercase">
							{drop.status === 'live' ? 'Live Drop Release' : 'Archived Drop'}
						</span>
						{#if drop.status === 'live'}
							<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-volt"></span>
						{/if}
					</div>
					<h1 class="font-display text-5xl leading-none uppercase md:text-7xl lg:text-8xl">
						{drop.name}
					</h1>
					<p class="mt-4 font-sans text-sm leading-relaxed text-ash md:text-base">
						{drop.description ?? drop.tagline ?? ''}
					</p>
				</div>
			</div>

			<!-- Product List -->
			<h2 class="mb-8 font-mono text-xs tracking-[0.2em] text-ash uppercase">
				Released items ({products.length})
			</h2>

			{#if products.length > 0}
				<div class="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
					{#each products as product (product.id)}
						<ProductCard {product} />
					{/each}
				</div>
			{:else}
				<div class="border border-dashed border-charcoal py-20 text-center">
					<p class="font-mono text-xs text-ash uppercase">No products released in this drop yet.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
