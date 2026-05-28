<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, Edit, FolderOpen, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { PageData } from './$types';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';

	let { data }: { data: PageData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		message: deleteCategoryMessage,
		enhance: deleteCategoryEnhance,
		submitting: deleteCategorySubmitting
	} = superForm(initialForm(() => data.deleteCategoryForm));

	const category = $derived(data.category);
	const subcategories = $derived(data.subcategories);
	const products = $derived(data.products);
</script>

<svelte:head>
	<title>{category.name} | Caro Admin</title>
	<meta name="description" content="View details for category {category.name}" />
</svelte:head>

<section class="mx-auto max-w-7xl pb-24">
	<!-- Top Navigation and Action Bar -->
	<div
		class="flex flex-col gap-4 border-b border-charcoal pb-5 md:flex-row md:items-center md:justify-between"
	>
		<div class="flex items-center gap-4">
			<a
				href={resolve('/app/categories')}
				class="group flex h-10 w-10 items-center justify-center border border-charcoal bg-void text-ash transition-colors hover:border-volt hover:text-volt"
				aria-label="Back to categories"
			>
				<ArrowLeft size={16} class="transition-transform group-hover:-translate-x-0.5" />
			</a>
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Catalog / Categories</p>
				<h1 class="font-display text-3xl leading-none text-bone uppercase sm:text-4xl">
					{category.name}
				</h1>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<AdminButton
				href={resolve(`/app/categories/${category.slug}/edit`)}
				variant="charcoal"
				size="md"
			>
				<Edit size={14} class="mr-1" />
				Edit Category
			</AdminButton>

			<form method="POST" action="?/deleteCategory" use:deleteCategoryEnhance>
				<input type="hidden" name="categoryId" value={category.id} />
				<AdminButton
					type="submit"
					variant="outline"
					size="md"
					class="border-red-400/40 text-red-300 hover:bg-red-400 hover:text-void"
					disabled={$deleteCategorySubmitting}
				>
					<Trash2 size={14} class="mr-1" />
					Delete
				</AdminButton>
			</form>
		</div>
	</div>

	{#if $deleteCategoryMessage}
		<p
			class="mt-6 border border-red-400/30 bg-red-950/20 px-4 py-3 font-mono text-[10px] tracking-widest text-red-300 uppercase"
		>
			{$deleteCategoryMessage}
		</p>
	{/if}

	<div class="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
		<!-- Main Information Column -->
		<div class="grid gap-6">
			<!-- Category Banner Card -->
			<AdminCard
				bg="bg-charcoal"
				border="border border-charcoal"
				class="overflow-hidden p-5 sm:p-6"
			>
				<div
					class="relative flex aspect-video w-full items-center justify-center overflow-hidden border border-charcoal bg-void"
				>
					{#if category.imageUrl}
						<img src={category.imageUrl} alt={category.name} class="h-full w-full object-cover" />
					{:else}
						<FolderOpen size={48} class="text-ash/20" />
					{/if}
				</div>

				<div class="mt-6">
					<h2 class="font-display text-2xl tracking-wider text-bone uppercase">
						Category Description
					</h2>
					<p class="mt-3 font-sans text-sm leading-6 whitespace-pre-wrap text-ash">
						{category.description || 'No description provided for this category.'}
					</p>
				</div>
			</AdminCard>

			<!-- Subcategories Card -->
			<AdminCard bg="bg-charcoal" border="border border-charcoal" class="p-5 sm:p-6">
				<h2
					class="border-b border-charcoal/80 pb-3 font-display text-xl tracking-wider text-bone uppercase"
				>
					Subcategories ({subcategories.length})
				</h2>

				{#if subcategories.length > 0}
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						{#each subcategories as sub (sub.id)}
							<a
								href={resolve(`/app/categories/${sub.slug}`)}
								class="group flex items-center justify-between border border-charcoal bg-void p-4 transition-colors hover:border-volt"
							>
								<div>
									<p
										class="font-mono text-xs font-semibold tracking-wider text-bone uppercase group-hover:text-volt"
									>
										{sub.name}
									</p>
									<p class="mt-0.5 font-mono text-[10px] text-ash">/{sub.slug}</p>
								</div>
								<span
									class="font-mono text-[9px] tracking-widest uppercase {sub.isActive
										? 'text-volt'
										: 'text-ash/40'}"
								>
									{sub.isActive ? 'Active' : 'Draft'}
								</span>
							</a>
						{/each}
					</div>
				{:else}
					<div class="mt-4 border border-dashed border-ash/15 py-8 text-center text-ash/40">
						<FolderOpen size={24} class="mx-auto mb-2 text-ash/30" />
						<p class="font-sans text-xs">This category has no subcategories.</p>
					</div>
				{/if}
			</AdminCard>
		</div>

		<!-- Right Sidebar Column -->
		<div class="grid gap-6">
			<!-- Category Metadata -->
			<AdminCard border="border border-charcoal" bg="bg-charcoal" padding="p-5">
				<p
					class="border-b border-charcoal/80 pb-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
				>
					Details
				</p>

				<div class="mt-4 grid gap-3 font-mono text-xs uppercase">
					<div class="flex justify-between">
						<span class="text-ash/50">Status:</span>
						<span class={category.isActive ? 'text-volt' : 'text-red-300'}>
							{category.isActive ? 'Active' : 'Draft'}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-ash/50">Slug:</span>
						<span class="max-w-[180px] truncate text-bone" title={category.slug}
							>{category.slug}</span
						>
					</div>
					<div class="flex justify-between font-mono">
						<span class="text-ash/50">Parent:</span>
						{#if category.parentId}
							<span
								class="max-w-[150px] truncate text-volt"
								title={data.parentCategoryName || 'Parent Category'}
							>
								{data.parentCategoryName || 'Parent Category'}
							</span>
						{:else}
							<span class="text-bone">Root</span>
						{/if}
					</div>
					<div class="flex justify-between">
						<span class="text-ash/50">Sort Order:</span>
						<span class="text-bone">{category.sortOrder}</span>
					</div>
					<div class="flex justify-between border-t border-charcoal/60 pt-3 text-[10px]">
						<span class="text-ash/50">Created:</span>
						<span class="text-ash">{new Date(category.createdAt).toLocaleDateString()}</span>
					</div>
					<div class="flex justify-between text-[10px]">
						<span class="text-ash/50">Updated:</span>
						<span class="text-ash">{new Date(category.updatedAt).toLocaleDateString()}</span>
					</div>
				</div>
			</AdminCard>

			<!-- Associated Products Sidebar (Limit 100) -->
			<AdminCard border="border border-charcoal" bg="bg-charcoal" padding="p-5">
				<p
					class="border-b border-charcoal/80 pb-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase"
				>
					Products ({products.length})
				</p>

				{#if products.length > 0}
					<div class="mt-4 grid max-h-[480px] gap-3 overflow-y-auto pr-1">
						{#each products as product (product.id)}
							<div class="flex flex-col justify-between gap-3 border border-charcoal bg-void p-3">
								<div class="flex items-center gap-3">
									<div class="h-10 w-8 shrink-0 overflow-hidden border border-charcoal bg-charcoal">
										{#if product.primaryImageUrl}
											<img
												src={product.primaryImageUrl}
												alt=""
												class="h-full w-full object-cover"
											/>
										{/if}
									</div>
									<div class="min-w-0">
										<a
											href={resolve(`/app/products/${product.slug}`)}
											class="block truncate font-mono text-xs font-semibold tracking-wider text-bone uppercase hover:text-volt"
										>
											{product.name}
										</a>
										<span class="block truncate font-mono text-[9px] text-ash">/{product.slug}</span
										>
									</div>
								</div>
								<div
									class="flex items-center justify-between border-t border-charcoal/60 pt-2 font-mono text-[9px] uppercase"
								>
									<span class="text-bone">LKR {product.basePrice.toLocaleString()}</span>
									<span class={product.isActive ? 'text-volt' : 'text-red-300'}>
										{product.isActive ? 'Active' : 'Inactive'}
									</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="mt-4 border border-dashed border-ash/15 py-8 text-center text-ash/40">
						<p class="font-sans text-xs">No products in this category.</p>
					</div>
				{/if}
			</AdminCard>
		</div>
	</div>
</section>
