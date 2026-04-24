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

<svelte:head>
	<title>{drop.name} | Caro Clothing</title>
	<meta name="description" content={drop.tagline.join(' ')} />
</svelte:head>

<div
	class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-void"
>
	<!-- Background -->
	<div class="absolute inset-0">
		<img src={drop.image} alt="" class="h-full w-full object-cover opacity-30" />
		<div class="absolute inset-0 bg-gradient-to-b from-void/80 via-transparent to-void/80"></div>
	</div>

	<!-- Content -->
	<div class="relative z-10 flex flex-col items-center px-5 text-center">
		<span class="mb-6 font-mono text-[10px] tracking-[0.3em] text-volt uppercase">
			{drop.name}
		</span>

		<h1
			class="max-w-4xl font-display text-[80px] leading-[0.88] text-bone uppercase md:text-[120px] lg:text-[160px]"
		>
			{#each drop.tagline as line}
				<span class="block">{line}</span>
			{/each}
		</h1>

		<div class="mt-12">
			<CountdownTimer targetDate={drop.launchDate} />
		</div>

		<form class="mt-12 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
			<input
				type="text"
				placeholder="PHONE OR EMAIL"
				class="flex-1 border border-ash/40 bg-transparent px-4 py-3 font-mono text-sm text-bone transition-colors outline-none placeholder:text-ash/40 focus:border-volt"
			/>
			<Button variant="primary" type="submit" class="px-8">Notify Me</Button>
		</form>
	</div>
</div>
