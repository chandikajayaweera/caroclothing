<script lang="ts">
	import { Switch } from 'bits-ui';

	let {
		label,
		description,
		name,
		checked = $bindable(),
		disabled = false,
		standalone = false,
		onclick,
		class: className = ''
	}: {
		label?: string;
		description?: string;
		name?: string;
		checked?: boolean;
		disabled?: boolean;
		standalone?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
	} = $props();

	$effect.pre(() => {
		if (checked === undefined) {
			checked = false;
		}
	});
</script>

{#if standalone}
	{#if name}
		<input type="hidden" {name} value={checked ? 'true' : 'false'} />
	{/if}
	<Switch.Root
		bind:checked
		{disabled}
		{onclick}
		class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-ash/30 bg-void transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-volt focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-transparent data-[state=checked]:bg-volt {className}"
	>
		<Switch.Thumb
			class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-void shadow ring-0 transition duration-200 ease-in-out data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
		/>
	</Switch.Root>
{:else}
	<div class="flex min-h-11 items-center justify-between gap-3 {className}">
		{#if label || description}
			<div class="grid min-w-0">
				{#if label}
					<span class="truncate font-sans text-sm font-semibold text-bone">{label}</span>
				{/if}
				{#if description}
					<span class="truncate font-sans text-xs text-ash/60">{description}</span>
				{/if}
			</div>
		{/if}

		{#if name}
			<input type="hidden" {name} value={checked ? 'true' : 'false'} />
		{/if}

		<Switch.Root
			bind:checked
			{disabled}
			{onclick}
			class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-ash/30 bg-void transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-volt focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-transparent data-[state=checked]:bg-volt"
		>
			<Switch.Thumb
				class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-void shadow ring-0 transition duration-200 ease-in-out data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
			/>
		</Switch.Root>
	</div>
{/if}
