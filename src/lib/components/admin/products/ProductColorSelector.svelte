<script lang="ts">
	import { Select } from 'bits-ui';
	import { Check, ChevronDown, Palette } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import type { ProductUiColor } from './product-ui.types';

	type ColorSelectableVariant = {
		colorId?: string | null;
		color: string;
		colorHex?: string | null;
	};
	type ColorUsageVariant = ColorSelectableVariant & { isDeleted?: boolean };

	let {
		variant = $bindable(),
		colors,
		showColorModal = $bindable(false),
		variants,
		originalIndex,
		label = 'Color Variant'
	}: {
		variant: ColorSelectableVariant;
		colors: ProductUiColor[];
		showColorModal: boolean;
		variants: ColorUsageVariant[];
		originalIndex: number;
		label?: string;
	} = $props();

	const uid = $props.id();
	const triggerId = `product-color-${uid}`;
	const labelId = `${triggerId}-label`;

	function isValidHex(value: string | null | undefined): value is string {
		return /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
	}

	function isColorUsed(colorId: string): boolean {
		return variants.some(
			(candidate, index) =>
				index !== originalIndex && !candidate.isDeleted && candidate.colorId === colorId
		);
	}

	const colorItems = $derived(
		colors.map((color) => ({
			value: color.id,
			label: `${color.name} ${color.hex}`,
			disabled: isColorUsed(color.id)
		}))
	);
	const selectedColor = $derived(colors.find((color) => color.id === variant.colorId));
	const displayColor = $derived(
		selectedColor ??
			(variant.color ? { id: '', name: variant.color, hex: variant.colorHex ?? '' } : undefined)
	);

	function selectColor(colorId: string): void {
		const selected = colors.find((color) => color.id === colorId);
		if (!selected || isColorUsed(selected.id)) return;

		variant.colorId = selected.id;
		variant.color = selected.name;
		variant.colorHex = selected.hex;
	}
</script>

<div class="grid gap-1">
	<label
		id={labelId}
		for={triggerId}
		class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90"
	>
		{label}
		<span class="ml-0.5 text-red-400" title="Required">*</span>
	</label>

	<div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
		<Select.Root
			type="single"
			value={variant.colorId ?? ''}
			onValueChange={selectColor}
			items={colorItems}
			required
		>
			<Select.Trigger
				id={triggerId}
				aria-labelledby={labelId}
				aria-required="true"
				class="flex min-h-11 min-w-0 items-center justify-between gap-2 border border-ash/30 bg-void px-3.5 py-2.5 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus-visible:border-volt focus-visible:ring-1 focus-visible:ring-volt"
			>
				{#if displayColor}
					<span class="flex min-w-0 flex-1 items-center gap-2 text-left">
						<span
							class="h-4 w-4 shrink-0 rounded-full border border-ash/30"
							class:bg-ash={isValidHex(displayColor.hex) === false}
							style:background={isValidHex(displayColor.hex) ? displayColor.hex : undefined}
							aria-hidden="true"
						></span>
						<span class="truncate">{displayColor.name}</span>
						{#if isValidHex(displayColor.hex)}
							<span class="hidden shrink-0 font-mono text-[10px] text-ash/50 sm:inline">
								{displayColor.hex}
							</span>
						{/if}
					</span>
				{:else}
					<span class="truncate text-ash/50">Select color</span>
				{/if}
				<ChevronDown size={16} class="shrink-0 text-ash/60" aria-hidden="true" />
			</Select.Trigger>

			<Select.Portal>
				<Select.Content
					sideOffset={4}
					class="z-50 w-(--bits-select-anchor-width) min-w-(--bits-select-anchor-width) border border-ash/20 bg-charcoal p-1 shadow-xl"
				>
					<Select.Viewport class="max-h-64 overflow-y-auto p-1">
						{#if colors.length === 0}
							<p class="px-3 py-4 text-center font-sans text-xs text-ash/60">No colors available</p>
						{:else}
							{#each colors as color (color.id)}
								{@const used = isColorUsed(color.id)}
								<Select.Item
									value={color.id}
									label={`${color.name} ${color.hex}`}
									disabled={used}
									class="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left font-sans text-sm text-bone outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-highlighted:bg-ash/10 data-selected:text-volt"
								>
									{#snippet children({ selected })}
										<span
											class="h-4 w-4 shrink-0 rounded-full border border-ash/30"
											class:bg-ash={!isValidHex(color.hex)}
											style:background={isValidHex(color.hex) ? color.hex : undefined}
											aria-hidden="true"
										></span>
										<span class="min-w-0 flex-1 truncate">{color.name}</span>
										<span class="shrink-0 font-mono text-[10px] text-ash/50">{color.hex}</span>
										{#if used}
											<span class="shrink-0 font-mono text-[9px] text-ash uppercase">Assigned</span>
										{:else if selected}
											<Check size={14} class="shrink-0 text-volt" aria-hidden="true" />
										{/if}
									{/snippet}
								</Select.Item>
							{/each}
						{/if}
					</Select.Viewport>
				</Select.Content>
			</Select.Portal>
		</Select.Root>

		<AdminButton
			type="button"
			variant="outline"
			size="icon"
			onclick={() => (showColorModal = true)}
			aria-label="Manage colors"
			title="Manage colors"
		>
			<Palette size={16} aria-hidden="true" />
		</AdminButton>
	</div>
</div>
