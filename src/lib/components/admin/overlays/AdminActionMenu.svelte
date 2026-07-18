<script module lang="ts">
	import type { ComponentType, SvelteComponent } from 'svelte';
	import type { IconProps } from 'lucide-svelte';

	export type AdminActionMenuItem = {
		label: string;
		description?: string;
		icon?: ComponentType<SvelteComponent<IconProps>>;
		disabled?: boolean;
		tone?: 'neutral' | 'accent' | 'danger';
		onselect: () => unknown;
	};
</script>

<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { ChevronDown, MoreHorizontal } from 'lucide-svelte';
	import AdminButton from '../controls/AdminButton.svelte';

	let {
		items,
		label = 'More',
		ariaLabel = 'More actions',
		align = 'end',
		side = 'bottom',
		class: className = ''
	}: {
		items: AdminActionMenuItem[];
		label?: string;
		ariaLabel?: string;
		align?: 'start' | 'center' | 'end';
		side?: 'top' | 'right' | 'bottom' | 'left';
		class?: string;
	} = $props();

	let open = $state(false);

	const toneClasses = {
		neutral: 'text-bone',
		accent: 'text-volt',
		danger: 'text-red-300'
	};

	async function runAction(item: AdminActionMenuItem): Promise<void> {
		open = false;
		await item.onselect();
	}
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<AdminButton
				{...props}
				type="button"
				variant="outline"
				aria-label={ariaLabel}
				aria-expanded={open}
				class="w-auto {className}"
			>
				<MoreHorizontal size={16} aria-hidden="true" />
				<span>{label}</span>
				<ChevronDown
					size={13}
					class="transition-transform {open ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</AdminButton>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content
			{align}
			{side}
			sideOffset={8}
			collisionPadding={12}
			class="z-100 w-[min(22rem,calc(100vw-1.5rem))] border border-ash/20 bg-charcoal p-1.5 shadow-2xl outline-none"
		>
			<DropdownMenu.Group aria-label={ariaLabel}>
				{#each items as item (item.label)}
					{@const Icon = item.icon}
					<DropdownMenu.Item
						textValue={item.label}
						disabled={item.disabled}
						onSelect={() => runAction(item)}
						class="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-highlighted:bg-void/60 {toneClasses[
							item.tone ?? 'neutral'
						]}"
					>
						{#if Icon}
							<Icon size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
						{/if}
						<span class="min-w-0">
							<span class="block font-mono text-[10px] font-bold tracking-widest uppercase">
								{item.label}
							</span>
							{#if item.description}
								<span class="mt-1 block font-sans text-[11px] leading-relaxed text-ash/70">
									{item.description}
								</span>
							{/if}
						</span>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
