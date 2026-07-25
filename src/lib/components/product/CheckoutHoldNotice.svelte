<script lang="ts">
	import { onMount } from 'svelte';

	let {
		size,
		initialSeconds
	}: {
		size: string;
		initialSeconds: number;
	} = $props();

	let remainingSeconds = $state<number | null>(null);
	const displaySeconds = $derived(remainingSeconds ?? initialSeconds);
	const displayTime = $derived(
		`${Math.floor(displaySeconds / 60)
			.toString()
			.padStart(2, '0')}:${(displaySeconds % 60).toString().padStart(2, '0')}`
	);

	onMount(() => {
		remainingSeconds = initialSeconds;

		const countdown = setInterval(() => {
			remainingSeconds = Math.max(0, (remainingSeconds ?? initialSeconds) - 1);
		}, 1000);

		return () => {
			clearInterval(countdown);
		};
	});
</script>

<div
	class="border border-amber-400/35 bg-amber-950/20 p-3 font-mono text-[11px] text-amber-300"
	role="status"
	aria-live="polite"
>
	<p class="font-bold tracking-widest uppercase">Reserved at another checkout</p>
	<p class="mt-1 leading-relaxed text-amber-200/80">
		Size {size} may become available in <span class="font-bold text-amber-300">{displayTime}</span>
		if checkout is not completed.
	</p>
</div>
