<script lang="ts">
	import { resolve } from '$app/paths';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		form: createCategoryForm,
		errors: createCategoryErrors,
		constraints: createCategoryConstraints,
		message: createCategoryMessage,
		enhance: createCategoryEnhance,
		submitting: createCategorySubmitting
	} = superForm(initialForm(() => data.createCategoryForm));

	const {
		form: updateCategoryForm,
		errors: updateCategoryErrors,
		constraints: updateCategoryConstraints,
		message: updateCategoryMessage,
		enhance: updateCategoryEnhance,
		submitting: updateCategorySubmitting
	} = superForm(
		initialForm(() => data.updateCategoryForm),
		{
			resetForm: false
		}
	);

	const {
		message: deleteCategoryMessage,
		enhance: deleteCategoryEnhance,
		submitting: deleteCategorySubmitting
	} = superForm(initialForm(() => data.deleteCategoryForm));

	const categories = $derived(data.categories);
</script>

<svelte:head>
	<title>Categories | Caro Admin</title>
</svelte:head>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<section>
	<a href={resolve('/app/products')}>Products</a>
	<h1>Categories</h1>

	<form method="GET">
		<label>
			Parent
			<select name="parentId">
				<option value="" selected={data.filters.parentId === ''}>All parents</option>
				<option value="root" selected={data.filters.parentId === 'root'}>Root only</option>
				{#each categories as category (category.id)}
					<option value={category.id} selected={data.filters.parentId === category.id}>
						{category.name}
					</option>
				{/each}
			</select>
		</label>

		<input type="hidden" name="includeInactive" value="false" />
		<label>
			<input
				type="checkbox"
				name="includeInactive"
				value="true"
				checked={data.filters.includeInactive}
			/>
			Include inactive
		</label>

		<label>
			Limit
			<input name="limit" type="number" min="1" value={data.filters.limit} />
		</label>

		<label>
			Offset
			<input name="offset" type="number" min="0" value={data.filters.offset} />
		</label>

		<button type="submit">Filter</button>
	</form>
</section>

<section>
	<h2>Create category</h2>

	{#if $createCategoryMessage}
		<p>{$createCategoryMessage}</p>
	{/if}

	<form
		method="POST"
		action="?/createCategory"
		enctype="multipart/form-data"
		use:createCategoryEnhance
	>
		<label>
			Name
			<input
				name="name"
				bind:value={$createCategoryForm.name}
				{...$createCategoryConstraints.name}
			/>
		</label>
		{#if $createCategoryErrors.name}
			<p>{$createCategoryErrors.name[0]}</p>
		{/if}

		<label>
			Slug
			<input
				name="slug"
				bind:value={$createCategoryForm.slug}
				{...$createCategoryConstraints.slug}
			/>
		</label>
		{#if $createCategoryErrors.slug}
			<p>{$createCategoryErrors.slug[0]}</p>
		{/if}

		<label>
			Description
			<textarea
				name="description"
				bind:value={$createCategoryForm.description}
				{...$createCategoryConstraints.description}
			></textarea>
		</label>

		<label>
			Parent
			<select name="parentId" bind:value={$createCategoryForm.parentId}>
				<option value="">No parent</option>
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</label>

		<label>
			Sort order
			<input
				name="sortOrder"
				type="number"
				bind:value={$createCategoryForm.sortOrder}
				{...$createCategoryConstraints.sortOrder}
			/>
		</label>

		<label>
			Image
			<input name="image" type="file" accept="image/*" {...$createCategoryConstraints.image} />
		</label>

		<label>
			<input type="checkbox" name="isActive" bind:checked={$createCategoryForm.isActive} />
			Active
		</label>

		<button type="submit" disabled={$createCategorySubmitting}>
			{$createCategorySubmitting ? 'Saving...' : 'Create category'}
		</button>
	</form>
</section>

<section>
	<h2>Update category</h2>

	{#if $updateCategoryMessage}
		<p>{$updateCategoryMessage}</p>
	{/if}

	<form
		method="POST"
		action="?/updateCategory"
		enctype="multipart/form-data"
		use:updateCategoryEnhance
	>
		<label>
			Category
			<select name="categoryId" bind:value={$updateCategoryForm.categoryId}>
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</label>

		<label>
			Name
			<input
				name="name"
				bind:value={$updateCategoryForm.name}
				{...$updateCategoryConstraints.name}
			/>
		</label>
		{#if $updateCategoryErrors.name}
			<p>{$updateCategoryErrors.name[0]}</p>
		{/if}

		<label>
			Slug
			<input
				name="slug"
				bind:value={$updateCategoryForm.slug}
				{...$updateCategoryConstraints.slug}
			/>
		</label>
		{#if $updateCategoryErrors.slug}
			<p>{$updateCategoryErrors.slug[0]}</p>
		{/if}

		<label>
			Description
			<textarea
				name="description"
				bind:value={$updateCategoryForm.description}
				{...$updateCategoryConstraints.description}
			></textarea>
		</label>

		<label>
			Parent
			<select name="parentId" bind:value={$updateCategoryForm.parentId}>
				<option value="">No parent</option>
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</label>

		<label>
			Sort order
			<input
				name="sortOrder"
				type="number"
				bind:value={$updateCategoryForm.sortOrder}
				{...$updateCategoryConstraints.sortOrder}
			/>
		</label>

		<label>
			Image
			<input name="image" type="file" accept="image/*" {...$updateCategoryConstraints.image} />
		</label>

		<label>
			<input type="checkbox" name="removeImage" bind:checked={$updateCategoryForm.removeImage} />
			Remove image
		</label>

		<label>
			<input type="checkbox" name="isActive" bind:checked={$updateCategoryForm.isActive} />
			Active
		</label>

		<button type="submit" disabled={$updateCategorySubmitting}>
			{$updateCategorySubmitting ? 'Saving...' : 'Update category'}
		</button>
	</form>
</section>

<section>
	<h2>Category list</h2>

	{#if $deleteCategoryMessage}
		<p>{$deleteCategoryMessage}</p>
	{/if}

	{#if categories.length > 0}
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>Slug</th>
					<th>Parent</th>
					<th>Sort</th>
					<th>Active</th>
					<th>Image</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each categories as category (category.id)}
					<tr>
						<td>{category.name}</td>
						<td>{category.slug}</td>
						<td>{category.parentId ?? 'Root'}</td>
						<td>{category.sortOrder}</td>
						<td>{category.isActive ? 'Yes' : 'No'}</td>
						<td>
							{#if category.imageUrl}
								<img src={category.imageUrl} alt={category.name} width="80" />
							{:else}
								None
							{/if}
						</td>
						<td>
							<form method="POST" action="?/deleteCategory" use:deleteCategoryEnhance>
								<input type="hidden" name="categoryId" value={category.id} />
								<button type="submit" disabled={$deleteCategorySubmitting}>Delete</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p>No categories found.</p>
	{/if}
</section>
