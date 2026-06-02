<script lang="ts">
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { ChevronDown, Check } from 'lucide-svelte';

	let {
		label,
		name,
		value = $bindable(),
		disabled = false,
		required = false,
		error,
		options = [],
		onchange,
		placeholder = 'Select option',
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
		placeholder?: string;
		class?: string;
		children?: Snippet;
		[key: string]: any;
	} = $props();

	const errorMessage = $derived(
		Array.isArray(error) ? error[0] : typeof error === 'string' ? error : undefined
	);

	let optionsList = $state<{ value: string; label: string }[]>([]);
	let hiddenSelect = $state<HTMLSelectElement | null>(null);

	function syncOptions() {
		if (hiddenSelect) {
			const optionElements = hiddenSelect.querySelectorAll('option');
			optionsList = Array.from(optionElements).map((el) => ({
				value: el.value,
				label: el.textContent?.trim() || ''
			}));
		}
	}

	$effect(() => {
		if (hiddenSelect) {
			syncOptions();
			const observer = new MutationObserver(syncOptions);
			observer.observe(hiddenSelect, { childList: true, subtree: true, characterData: true });
			return () => observer.disconnect();
		}
	});

	const selectedOption = $derived(optionsList.find((o) => o.value === value));

	let lastDispatchedValue = $state(value);
	$effect(() => {
		if (value !== lastDispatchedValue) {
			lastDispatchedValue = value;
			if (hiddenSelect) {
				hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
			}
		}
	});
</script>

<div class="grid gap-1 {className}">
	{#if label}
		<span class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90">
			{label}
			{#if required}
				<span class="ml-0.5 font-sans text-red-400" title="Required">*</span>
			{/if}
		</span>
	{/if}

	<!-- Hidden native select for form serialization and option capturing -->
	<select
		bind:this={hiddenSelect}
		{name}
		{disabled}
		{onchange}
		bind:value
		aria-invalid={errorMessage ? 'true' : undefined}
		class="hidden"
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

	<!-- Bits UI Custom Dropdown -->
	<Select.Root type="single" bind:value={value as any} items={optionsList} {disabled}>
		<Select.Trigger
			class="flex min-h-11 w-full items-center justify-between border bg-void px-3.5 py-3 font-sans text-sm text-bone transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:cursor-not-allowed disabled:opacity-40 {errorMessage
				? 'border-red-400/50 focus:border-red-400'
				: 'border-ash/30'}"
		>
			<span class="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
			<ChevronDown size={16} class="ml-2 shrink-0 text-ash/60" />
		</Select.Trigger>
		<Select.Portal>
			<Select.Content
				class="z-50 w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] rounded-sm border border-ash/15 bg-charcoal p-1 shadow-xl"
				sideOffset={4}
			>
				<Select.Viewport class="max-h-60 overflow-y-auto p-1">
					{#each optionsList as option (option.value)}
						<Select.Item
							class="flex h-10 w-full cursor-pointer items-center rounded-sm px-3 py-2 text-sm text-bone transition-colors outline-none select-none hover:bg-ash/10 disabled:cursor-not-allowed disabled:opacity-40 data-[highlighted]:bg-ash/10 data-[selected]:font-semibold data-[selected]:text-volt"
							value={option.value}
							label={option.label}
						>
							{#snippet children({ selected })}
								<span class="truncate">{option.label}</span>
								{#if selected}
									<Check size={14} class="ml-auto shrink-0 text-volt" />
								{/if}
							{/snippet}
						</Select.Item>
					{/each}
				</Select.Viewport>
			</Select.Content>
		</Select.Portal>
	</Select.Root>

	{#if errorMessage}
		<span class="mt-0.5 font-sans text-xs text-red-400">
			{errorMessage}
		</span>
	{/if}
</div>
