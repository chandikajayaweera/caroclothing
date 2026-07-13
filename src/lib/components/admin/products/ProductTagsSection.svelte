<script lang="ts">
	import { X, Plus } from 'lucide-svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import type { ProductTagsForm, ProductUiTag } from './product-ui.types';

	let {
		form = $bindable(),
		tags,
		newTagDraft = $bindable(''),
		onAddNewTag,
		onRemoveNewTag,
		onAddExistingTag,
		onRemoveExistingTag,
		onNewTagKeydown
	}: {
		form: ProductTagsForm;
		tags: ProductUiTag[];
		newTagDraft: string;
		onAddNewTag: () => void;
		onRemoveNewTag: (name: string) => void;
		onAddExistingTag: (id: string) => void;
		onRemoveExistingTag: (id: string) => void;
		onNewTagKeydown: (e: KeyboardEvent) => void;
	} = $props();

	const selectedTags = $derived(tags.filter((tag) => form.tagIds.includes(tag.id)));
	const availableTags = $derived(tags.filter((tag) => !form.tagIds.includes(tag.id)));
</script>

<AdminCard title="Product Tags" border="border border-ash/15" class="shadow-sm">
	<div class="mt-4 grid gap-4">
		{#if selectedTags.length > 0 || form.newTagNames.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each selectedTags as tag (tag.id)}
					<button
						type="button"
						onclick={() => onRemoveExistingTag(tag.id)}
						class="inline-flex min-h-9 items-center gap-2 border border-volt bg-volt/10 px-3 font-sans text-xs tracking-wider text-volt uppercase transition-colors hover:bg-volt hover:text-void"
					>
						{tag.name}
						<X size={12} aria-hidden="true" />
					</button>
				{/each}
				{#each form.newTagNames as tagName (tagName)}
					<button
						type="button"
						onclick={() => onRemoveNewTag(tagName)}
						class="inline-flex min-h-9 items-center gap-2 border border-ash/30 px-3 font-sans text-xs text-bone uppercase transition-colors hover:border-red-400 hover:text-red-300"
					>
						{tagName}
						<X size={12} aria-hidden="true" />
					</button>
				{/each}
			</div>
		{/if}

		{#if tags.length > 0}
			<div class="grid gap-2">
				<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Existing Tags</span>
				{#if availableTags.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each availableTags as tag (tag.id)}
							<button
								type="button"
								onclick={() => onAddExistingTag(tag.id)}
								class="inline-flex min-h-8 items-center border border-ash/20 bg-void px-3 font-sans text-xs text-ash transition-colors hover:border-volt hover:text-volt"
							>
								{tag.name}
							</button>
						{/each}
					</div>
				{:else}
					<p class="font-sans text-xs text-ash/50">All available database tags selected.</p>
				{/if}
			</div>
		{/if}

		<div class="flex items-end gap-2">
			<AdminInput
				label="Add Custom Tag"
				bind:value={newTagDraft}
				onkeydown={onNewTagKeydown}
				placeholder="Press Enter to add tag"
				name="newTagDraft"
				class="flex-1"
			/>
			<AdminButton
				type="button"
				onclick={onAddNewTag}
				variant="outline"
				class="flex min-h-11 w-11 shrink-0 items-center justify-center p-0"
				aria-label="Add tag"
			>
				<Plus size={15} aria-hidden="true" />
			</AdminButton>
		</div>
	</div>
</AdminCard>
