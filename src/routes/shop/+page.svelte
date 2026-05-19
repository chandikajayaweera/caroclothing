<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const products = $derived(data.products.items);
</script>

<svelte:head>
	<title>Shop | Caro Clothing</title>
	<meta
		name="description"
		content="Shop all Caro Clothing products including tees, hoodies, and accessories."
	/>
</svelte:head>

<section>
	<h1>Shop</h1>
	<p>{data.products.total} styles</p>

	<form method="GET">
		<label>
			Category
			<select name="categoryId">
				<option value="" selected={data.filters.categoryId === ''}>All categories</option>
				{#each data.categories as category (category.id)}
					<option value={category.id} selected={data.filters.categoryId === category.id}>
						{category.name}
					</option>
				{/each}
			</select>
		</label>

		<label>
			Tier
			<select name="tier">
				<option value="" selected={data.filters.tier === ''}>All tiers</option>
				{#each data.tierOptions as option (option.value)}
					<option value={option.value} selected={data.filters.tier === option.value}>
						{option.label}
					</option>
				{/each}
			</select>
		</label>

		<label>
			Gender
			<select name="gender">
				<option value="" selected={data.filters.gender === ''}>All genders</option>
				{#each data.genderOptions as option (option.value)}
					<option value={option.value} selected={data.filters.gender === option.value}>
						{option.label}
					</option>
				{/each}
			</select>
		</label>

		<label>
			New arrival
			<select name="isNewArrival">
				<option value="" selected={data.filters.isNewArrival === ''}>Any</option>
				<option value="true" selected={data.filters.isNewArrival === 'true'}>New</option>
				<option value="false" selected={data.filters.isNewArrival === 'false'}>Not new</option>
			</select>
		</label>

		<input type="hidden" name="limit" value={data.filters.limit} />
		<input type="hidden" name="offset" value={data.filters.offset} />
		<button type="submit">Filter</button>
	</form>
</section>

<section>
	<h2>Products</h2>

	{#if products.length > 0}
		<ul>
			{#each products as product (product.id)}
				<li>
					<a href={resolve(`/shop/${product.slug}`)}>
						{#if product.primaryImageUrl}
							<img src={product.primaryImageUrl} alt={product.name} width="160" />
						{/if}
						<h3>{product.name}</h3>
					</a>
					<p>LKR {product.basePrice}</p>
					{#if product.compareAtPrice}
						<p>Was LKR {product.compareAtPrice}</p>
					{/if}
					<p>{product.shortDescription ?? ''}</p>
					<p>{product.tier} / {product.gender} / {product.fit}</p>
					{#if product.variants.length > 0}
						<ul>
							{#each product.variants as variant (variant.id)}
								<li>{variant.color} {variant.size}</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p>No products found.</p>
	{/if}
</section>
