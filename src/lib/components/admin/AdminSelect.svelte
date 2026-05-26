<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		name,
		value = $bindable(),
		disabled = false,
		required = false,
		error,
		options = [],
		onchange,
		class: className = '',
		children,
		...rest
	}: {
		label?: string;
		name: string;
		value?: any;
		disabled?: boolean;
		required?: boolean;
		error?: string | string[];
		options?: { value: any; label: string }[];
		onchange?: (event: Event) => void;
		class?: string;
		children?: Snippet;
		[key: string]: any;
	} = $props();

	const errorMessage = $derived(
		Array.isArray(error) ? error[0] : typeof error === 'string' ? error : undefined
	);
</script>

<label class="grid gap-1 {className}">
	{#if label}
		<span class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90">
			{label}
			{#if required}
				<span class="ml-0.5 font-sans text-red-400" title="Required">*</span>
			{/if}
		</span>
	{/if}
	<select
		{name}
		{disabled}
		{onchange}
		bind:value={value}
		aria-invalid={errorMessage ? 'true' : undefined}
		class="min-h-11 border bg-void px-3.5 py-3 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:cursor-not-allowed disabled:opacity-40 {errorMessage ? 'border-red-400/50 focus:border-red-400' : 'border-ash/30'}"
		{...rest}
	>
		{#if children}
			{@render children()}
		{:else}
			{#each options as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		{/if}
	</select>
	{#if errorMessage}
		<span class="mt-0.5 font-sans text-xs text-red-400">
			{errorMessage}
		</span>
	{/if}
</label>
