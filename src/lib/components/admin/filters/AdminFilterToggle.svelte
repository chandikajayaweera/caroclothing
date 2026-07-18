<script lang="ts">
	let {
		label,
		name,
		checked = $bindable(false),
		uncheckedValue = '',
		onclick,
		class: className = ''
	}: {
		label?: string;
		name?: string;
		checked?: boolean;
		uncheckedValue?: string;
		onclick?: (event: MouseEvent) => void;
		class?: string;
	} = $props();

	let localChecked = $state(false);
	let lastCheckedProp = $state(false);

	$effect(() => {
		if (checked !== lastCheckedProp) {
			localChecked = checked;
			lastCheckedProp = checked;
		}
	});
</script>

<div class="grid gap-1 {className}">
	{#if label}
		<span class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90">
			{label}
		</span>
	{/if}

	<button
		type="button"
		onclick={(e) => {
			localChecked = !localChecked;
			checked = localChecked;
			if (onclick) onclick(e);
		}}
		class="flex min-h-11 w-full items-center justify-between border bg-void px-3.5 py-3 font-sans text-sm transition-colors outline-none hover:border-ash/60 {localChecked
			? 'border-volt font-semibold text-volt'
			: 'border-ash/30 text-bone'}"
	>
		<span>{localChecked ? 'Yes' : 'No'}</span>
		<span
			class="h-2 w-2 rounded-full transition-colors {localChecked
				? 'bg-volt shadow-[0_0_8px_rgba(200,255,0,0.6)]'
				: 'bg-ash/40'}"
		></span>
	</button>

	{#if name}
		<input type="hidden" {name} value={localChecked ? 'true' : uncheckedValue} />
	{/if}
</div>
