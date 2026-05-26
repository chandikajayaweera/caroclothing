<script lang="ts">
	let {
		label,
		description,
		name,
		checked = $bindable(false),
		disabled = false,
		standalone = false,
		onclick,
		class: className = ''
	}: {
		label?: string;
		description?: string;
		name?: string;
		checked?: boolean | null;
		disabled?: boolean;
		standalone?: boolean;
		onclick?: (event: Event) => void;
		class?: string;
	} = $props();

	function handleToggle(e: MouseEvent): void {
		if (disabled) return;
		checked = !checked;
		if (onclick) {
			onclick(e);
		}
	}
</script>

{#if standalone}
	{#if name}
		<input type="hidden" {name} value={checked ? 'true' : 'false'} />
	{/if}
	<button
		type="button"
		role="switch"
		aria-checked={!!checked}
		aria-label={label ?? name ?? 'Toggle switch'}
		disabled={disabled}
		onclick={handleToggle}
		class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-volt bg-charcoal disabled:cursor-not-allowed disabled:opacity-40 {className}"
		class:bg-volt={!!checked}
	>
		<span
			class="pointer-events-none inline-block h-5 w-5 translate-x-0 transform rounded-full bg-void shadow ring-0 transition duration-200 ease-in-out"
			class:translate-x-5={!!checked}
		></span>
	</button>
{:else}
	<div class="flex min-h-11 items-center justify-between gap-3 {className}">
		{#if label || description}
			<div class="grid min-w-0">
				{#if label}
					<span class="font-sans text-sm font-semibold text-bone truncate">{label}</span>
				{/if}
				{#if description}
					<span class="font-sans text-xs text-ash/60 truncate">{description}</span>
				{/if}
			</div>
		{/if}

		{#if name}
			<input type="hidden" {name} value={checked ? 'true' : 'false'} />
		{/if}

		<button
			type="button"
			role="switch"
			aria-checked={!!checked}
			aria-label={label ?? name ?? 'Toggle switch'}
			disabled={disabled}
			onclick={handleToggle}
			class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-volt bg-charcoal disabled:cursor-not-allowed disabled:opacity-40"
			class:bg-volt={!!checked}
		>
			<span
				class="pointer-events-none inline-block h-5 w-5 translate-x-0 transform rounded-full bg-void shadow ring-0 transition duration-200 ease-in-out"
				class:translate-x-5={!!checked}
			></span>
		</button>
	</div>
{/if}
