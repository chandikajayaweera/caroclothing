<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';

	type SelectValue = string | number | null | undefined;
	type SelectOption = {
		value: SelectValue;
		label: string;
		disabled?: boolean;
	};

	let {
		label,
		name,
		id,
		value = $bindable(),
		disabled = false,
		required = false,
		error,
		helpText,
		options = [],
		onchange,
		placeholder = 'Select option',
		class: className = '',
		children,
		...rest
	}: {
		label?: string;
		name: string;
		id?: string;
		value?: SelectValue;
		disabled?: boolean;
		required?: boolean;
		error?: string | string[];
		helpText?: string;
		options?: SelectOption[];
		onchange?: (event: Event) => void;
		placeholder?: string;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	} = $props();

	const errorMessage = $derived(
		Array.isArray(error) ? error[0] : typeof error === 'string' ? error : undefined
	);
	const hasEmptyOption = $derived(options.some((option) => String(option.value ?? '') === ''));
</script>

<label class="grid min-w-0 gap-1 {className}">
	{#if label}
		<span class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90">
			{label}
			{#if required}
				<span class="ml-0.5 text-red-400" aria-hidden="true">*</span>
			{/if}
		</span>
	{/if}

	<div class="relative min-w-0">
		<select
			{...rest}
			{id}
			{name}
			{disabled}
			{required}
			{onchange}
			bind:value
			aria-invalid={errorMessage ? 'true' : undefined}
			class="min-h-11 w-full appearance-none border bg-void px-3.5 py-2.5 pr-10 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt focus-visible:ring-2 focus-visible:ring-volt/30 disabled:cursor-not-allowed disabled:opacity-40 {errorMessage
				? 'border-red-400/50 focus:border-red-400'
				: 'border-ash/30'}"
		>
			{#if children}
				{@render children()}
			{:else}
				{#if !hasEmptyOption}
					<option value="" disabled={required}>{placeholder}</option>
				{/if}
				{#each options as option, index (index)}
					<option value={option.value ?? ''} disabled={option.disabled}>{option.label}</option>
				{/each}
			{/if}
		</select>
		<ChevronDown
			size={16}
			class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ash/60"
			aria-hidden="true"
		/>
	</div>

	{#if errorMessage}
		<span class="mt-0.5 font-sans text-xs text-red-400">{errorMessage}</span>
	{:else if helpText}
		<p class="font-sans text-[11px] text-ash/60">{helpText}</p>
	{/if}
</label>
