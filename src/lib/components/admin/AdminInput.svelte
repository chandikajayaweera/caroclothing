<script lang="ts">
	let {
		label,
		name,
		value = $bindable(),
		type = 'text',
		placeholder,
		disabled = false,
		required = false,
		error,
		helpText,
		class: className = '',
		oninput,
		onkeydown,
		...rest
	}: {
		label?: string;
		name: string;
		value?: any;
		type?: string;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		error?: string | string[];
		helpText?: string;
		class?: string;
		oninput?: (event: Event) => void;
		onkeydown?: (event: KeyboardEvent) => void;
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
	<input
		{type}
		{name}
		{placeholder}
		{disabled}
		{oninput}
		{onkeydown}
		bind:value
		aria-invalid={errorMessage ? 'true' : undefined}
		class="min-h-11 border bg-void px-4 py-2.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:cursor-not-allowed disabled:opacity-40 {errorMessage
			? 'border-red-400/50 focus:border-red-400'
			: 'border-ash/30'}"
		{...rest}
	/>
	{#if errorMessage}
		<span class="mt-0.5 font-sans text-xs text-red-400">
			{errorMessage}
		</span>
	{/if}
	{#if helpText && !errorMessage}
		<p class="font-sans text-[11px] text-ash/50">
			{helpText}
		</p>
	{/if}
</label>
