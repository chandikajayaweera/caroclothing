<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let { targetDate }: { targetDate: Date } = $props();

	let timeLeft = $state({
		days: '00',
		hours: '00',
		minutes: '00',
		seconds: '00'
	});

	let interval: any;

	function updateCountdown() {
		const now = new Date().getTime();
		const distance = targetDate.getTime() - now;

		if (distance < 0) {
			clearInterval(interval);
			// Redirect or show live
			return;
		}

		const days = Math.floor(distance / (1000 * 60 * 60 * 24));
		const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((distance % (1000 * 60)) / 1000);

		timeLeft = {
			days: days.toString().padStart(2, '0'),
			hours: hours.toString().padStart(2, '0'),
			minutes: minutes.toString().padStart(2, '0'),
			seconds: seconds.toString().padStart(2, '0')
		};
	}

	onMount(() => {
		updateCountdown();
		interval = setInterval(updateCountdown, 1000);
	});

	onDestroy(() => {
		clearInterval(interval);
	});
</script>

<div class="flex gap-4 md:gap-8 font-mono text-4xl md:text-6xl text-volt tracking-[0.1em]">
	<div class="flex flex-col items-center">
		<span>{timeLeft.days}</span>
		<span class="text-[9px] uppercase tracking-widest text-ash/60 mt-2">Days</span>
	</div>
	<div class="flex flex-col items-center">
		<span>:</span>
	</div>
	<div class="flex flex-col items-center">
		<span>{timeLeft.hours}</span>
		<span class="text-[9px] uppercase tracking-widest text-ash/60 mt-2">Hours</span>
	</div>
	<div class="flex flex-col items-center">
		<span>:</span>
	</div>
	<div class="flex flex-col items-center">
		<span>{timeLeft.minutes}</span>
		<span class="text-[9px] uppercase tracking-widest text-ash/60 mt-2">Mins</span>
	</div>
	<div class="flex flex-col items-center">
		<span>:</span>
	</div>
	<div class="flex flex-col items-center">
		<span>{timeLeft.seconds}</span>
		<span class="text-[9px] uppercase tracking-widest text-ash/60 mt-2">Secs</span>
	</div>
</div>
