<script lang="ts">
	import CountdownTimer from '$lib/components/drops/CountdownTimer.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const drop = {
		name: 'DROP 002',
		tagline: ['SOMETHING NEW.', 'SAME ENERGY.'],
		launchDate: new Date('2025-06-01T10:00:00+0530'),
		isLive: false,
		image: '/images/hero.png'
	};
</script>

<div class="min-h-screen relative flex flex-col items-center justify-center bg-void overflow-hidden">
	<!-- Background -->
	<div class="absolute inset-0">
		<img src={drop.image} alt="" class="w-full h-full object-cover opacity-30" />
		<div class="absolute inset-0 bg-gradient-to-b from-void/80 via-transparent to-void/80"></div>
	</div>

	<!-- Content -->
	<div class="relative z-10 text-center px-5 flex flex-col items-center">
		<span class="font-mono text-[10px] text-volt uppercase tracking-[0.3em] mb-6">
			{drop.name}
		</span>
		
		<h1 class="font-display text-[80px] md:text-[120px] lg:text-[160px] leading-[0.88] text-bone uppercase max-w-4xl">
			{#each drop.tagline as line}
				<span class="block">{line}</span>
			{/each}
		</h1>

		<div class="mt-12">
			<CountdownTimer targetDate={drop.launchDate} />
		</div>

		<form class="mt-12 flex flex-col sm:flex-row gap-2 w-full max-w-sm">
			<input
				type="text"
				placeholder="PHONE OR EMAIL"
				class="flex-1 bg-transparent border border-ash/40 px-4 py-3 font-mono text-sm text-bone placeholder:text-ash/40 outline-none focus:border-volt transition-colors"
			/>
			<Button variant="primary" type="submit" class="px-8">
				Notify Me
			</Button>
		</form>
	</div>
</div>
