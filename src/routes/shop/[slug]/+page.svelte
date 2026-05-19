<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const product = $derived(data.product);
</script>

<svelte:head>
	<title>{product.metaTitle ?? product.name} | Caro Clothing</title>
	<meta name="description" content={product.metaDescription ?? product.shortDescription ?? ''} />
</svelte:head>

<article>
	<nav>
		<a href={resolve('/shop')}>Back to shop</a>
	</nav>

	<header>
		<p>{product.tier} / {product.gender} / {product.fit}</p>
		<h1>{product.name}</h1>
		<p>LKR {product.basePrice}</p>
		{#if product.compareAtPrice}
			<p>Was LKR {product.compareAtPrice}</p>
		{/if}
		<p>{product.shortDescription ?? ''}</p>
	</header>

	<section>
		<h2>Images</h2>
		{#if product.images.length > 0}
			<ul>
				{#each product.images as image (image.id)}
					<li>
						<img src={image.imageUrl} alt={image.altText ?? product.name} width="320" />
						<p>{image.altText ?? ''}</p>
					</li>
				{/each}
			</ul>
		{:else}
			<p>No images available.</p>
		{/if}
	</section>

	<section>
		<h2>Variants</h2>
		{#if product.variants.length > 0}
			<table>
				<thead>
					<tr>
						<th>Size</th>
						<th>Color</th>
						<th>Price</th>
						<th>SKU</th>
					</tr>
				</thead>
				<tbody>
					{#each product.variants as variant (variant.id)}
						<tr>
							<td>{variant.size}</td>
							<td>{variant.color}</td>
							<td>LKR {variant.effectivePrice}</td>
							<td>{variant.sku}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p>No variants available.</p>
		{/if}
	</section>

	<section>
		<h2>Details</h2>
		<p>{product.description ?? ''}</p>
		<p>{product.material ?? ''}</p>
		<p>{product.careInstructions ?? ''}</p>
		{#if product.category}
			<p>Category: {product.category.name}</p>
		{/if}
		{#if product.tags.length > 0}
			<ul>
				{#each product.tags as tag (tag.id)}
					<li>{tag.name}</li>
				{/each}
			</ul>
		{/if}
	</section>
</article>
