<script lang="ts">
	let {
		checked = $bindable(false),
		disabled = false,
		name,
		value,
		onchange,
		ariaLabel
	}: {
		checked?: boolean;
		disabled?: boolean;
		name?: string;
		value?: string;
		onchange?: (event: Event) => void;
		ariaLabel?: string;
	} = $props();
</script>

<label class="inline-grid h-11 w-11 cursor-pointer place-items-center sm:h-9 sm:w-9">
	<input
		type="checkbox"
		{name}
		{value}
		{disabled}
		{onchange}
		bind:checked
		aria-label={ariaLabel}
		class="h-4 w-4 cursor-pointer border border-ash/40 bg-void accent-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:cursor-not-allowed disabled:opacity-40"
	/>
</label>
