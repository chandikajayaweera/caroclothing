<script lang="ts">
	import { Label } from 'bits-ui';
	let {
		label,
		name,
		value = $bindable(''),
		placeholder = 'C8FF00',
		disabled = false,
		clientId = Math.random().toString(36).slice(2, 9),
		class: className = '',
		oninput
	}: {
		label?: string;
		name?: string;
		value: string | null | undefined;
		placeholder?: string;
		disabled?: boolean;
		clientId?: string;
		class?: string;
		oninput?: (event: Event) => void;
	} = $props();

	let hexIndicatorActive = $state(false);

	function handleHexInput(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		let val = input.value;

		if (val.includes('#')) {
			val = val.replace(/#/g, '');
			hexIndicatorActive = true;
			setTimeout(() => {
				hexIndicatorActive = false;
			}, 800);
		}

		if (val.length > 6) {
			val = val.slice(0, 6);
		}

		input.value = val;
		value = val ? `#${val}` : '';

		if (oninput) {
			oninput(event);
		}
	}

	function isValidHex(hex: string | null | undefined): boolean {
		return /^#[0-9A-Fa-f]{6}$/.test(hex ?? '');
	}
</script>

<Label.Root class="grid gap-1 {className}">
	{#if label}
		<span class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90">
			{label}
		</span>
	{/if}

	{#if name}
		<input type="hidden" {name} value={value ?? ''} />
	{/if}

	<div class="grid grid-cols-[minmax(0,1fr)_44px]">
		<div class="relative w-full">
			<span
				class="absolute top-[11px] left-3 font-mono text-sm transition-colors duration-200 {hexIndicatorActive
					? 'font-bold text-volt'
					: 'text-ash/40'}"
			>
				#
			</span>
			<input
				value={value ? value.replace('#', '') : ''}
				{placeholder}
				{disabled}
				oninput={handleHexInput}
				maxlength="7"
				class="min-h-11 w-full border border-ash/30 bg-void py-2 pr-3 pl-8 font-mono text-sm text-bone placeholder-ash/45 transition-colors outline-none focus:border-volt disabled:cursor-not-allowed disabled:opacity-40"
			/>
		</div>
		<span
			class="grid min-h-11 place-items-center border border-l-0 border-ash/30 bg-void"
			aria-hidden="true"
		>
			{#if isValidHex(value)}
				<span class="h-5 w-5 rounded-full border border-ash/30 shadow-sm" style:background={value}
				></span>
			{/if}
		</span>
	</div>
</Label.Root>
