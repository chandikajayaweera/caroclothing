<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import type { ProductPublishingConstraints, ProductPublishingForm } from './product-ui.types';

	let {
		form = $bindable(),
		constraints,
		carePresets,
		materialPresets
	}: {
		form: ProductPublishingForm;
		constraints: ProductPublishingConstraints;
		carePresets: string[];
		materialPresets: string[];
	} = $props();

	function appendCare(preset: string) {
		const current = form.careInstructions || '';
		if (current.includes(preset)) return;
		form.careInstructions = current ? `${current}, ${preset}` : preset;
	}

	function appendMaterial(preset: string) {
		const current = form.material || '';
		if (current.includes(preset)) return;
		form.material = current ? `${current}, ${preset}` : preset;
	}
</script>

<details class="group border border-ash/15 bg-charcoal p-5 shadow-sm md:p-6">
	<summary
		class="flex cursor-pointer items-center justify-between font-display text-2xl leading-none tracking-wide text-bone uppercase select-none"
	>
		Material & Care
		<span class="text-ash transition-transform duration-200 group-open:rotate-180">
			<ChevronDown size={20} />
		</span>
	</summary>
	<div class="mt-5 grid gap-4 border-t border-ash/10 pt-4">
		<div class="grid gap-1">
			<AdminInput
				label="Material"
				name="material"
				bind:value={form.material}
				placeholder="e.g. 100% Organic Heavyweight Cotton"
				{...constraints.material}
			/>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each materialPresets as preset (preset)}
					<button
						type="button"
						onclick={() => appendMaterial(preset)}
						class="border border-ash/20 bg-void px-2.5 py-1 font-sans text-[11px] text-ash transition-colors hover:border-volt hover:text-volt"
					>
						+ {preset}
					</button>
				{/each}
			</div>
		</div>

		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
				>Care Instructions</span
			>
			<textarea
				name="careInstructions"
				rows="3"
				placeholder="e.g. Wash inside out, line dry to preserve graphic prints..."
				bind:value={form.careInstructions}
				class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone outline-none focus:border-volt"
				{...constraints.careInstructions}
			></textarea>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each carePresets as preset (preset)}
					<button
						type="button"
						onclick={() => appendCare(preset)}
						class="border border-ash/20 bg-void px-2.5 py-1 font-sans text-[11px] text-ash transition-colors hover:border-volt hover:text-volt"
					>
						+ {preset}
					</button>
				{/each}
			</div>
		</label>
	</div>
</details>

<details class="group border border-ash/15 bg-charcoal p-5 shadow-sm md:p-6">
	<summary
		class="flex cursor-pointer items-center justify-between font-display text-2xl leading-none tracking-wide text-bone uppercase select-none"
	>
		SEO Configuration
		<span class="text-ash transition-transform duration-200 group-open:rotate-180">
			<ChevronDown size={20} />
		</span>
	</summary>
	<div class="mt-5 grid gap-4 border-t border-ash/10 pt-4">
		<AdminInput
			label="Meta Title"
			name="metaTitle"
			bind:value={form.metaTitle}
			placeholder="Leave empty to use product name"
			{...constraints.metaTitle}
		/>
		<label class="grid gap-1">
			<span class="font-sans text-xs font-semibold tracking-wide text-ash/90">Meta Description</span
			>
			<textarea
				name="metaDescription"
				rows="3"
				placeholder="Leave empty to use product summary"
				bind:value={form.metaDescription}
				class="border border-ash/30 bg-void px-4 py-2.5 font-sans text-sm text-bone outline-none focus:border-volt"
				{...constraints.metaDescription}
			></textarea>
		</label>
	</div>
</details>
