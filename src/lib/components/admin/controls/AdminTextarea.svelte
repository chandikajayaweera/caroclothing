<script lang="ts">
	let {
		label,
		name,
		value = $bindable(),
		placeholder,
		rows = 3,
		disabled = false,
		required = false,
		error,
		...rest
	}: {
		label?: string;
		name: string;
		value?: string | null;
		placeholder?: string;
		rows?: number;
		disabled?: boolean;
		required?: boolean;
		error?: string | string[];
		[key: string]: unknown;
	} = $props();

	const errorMessage = $derived(Array.isArray(error) ? error[0] : error);
</script>

<label class="grid gap-1">
	{#if label}
		<span class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90">
			{label}{#if required}<span class="ml-0.5 text-red-400" title="Required">*</span>{/if}
		</span>
	{/if}
	<textarea
		{name}
		{placeholder}
		{rows}
		{disabled}
		{required}
		bind:value
		aria-invalid={errorMessage ? 'true' : undefined}
		class="w-full border bg-void px-3.5 py-2.5 font-sans text-sm text-bone placeholder-ash/45 outline-none hover:border-ash/60 focus:border-volt disabled:cursor-not-allowed disabled:opacity-40 {errorMessage
			? 'border-red-400/50'
			: 'border-ash/30'}"
		{...rest}
	></textarea>
	{#if errorMessage}<span class="font-sans text-xs text-red-400">{errorMessage}</span>{/if}
</label>
