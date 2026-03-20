<script lang="ts">
	import LiquidBackground from '$lib/components/LiquidBackground.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import HeroText from '$lib/components/HeroText.svelte';
	import SubscribeForm from '$lib/components/SubscribeForm.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { fade } from 'svelte/transition';

	let { data } = $props();
</script>

<svelte:head>
	<title>Caro Clothing | Coming Soon</title>
	<meta name="description" content="Caro Clothing redefines modern apparel with minimalist aesthetics and uncompromising quality." />
</svelte:head>

<LiquidBackground />

<div class="h-dvh flex flex-col relative z-10 px-4 sm:px-8 md:px-16 w-full max-w-7xl mx-auto overflow-y-auto overflow-x-hidden">
	<header 
		in:fade={{ duration: 1000 }}
			class="w-full py-6 md:py-8 flex justify-center md:justify-start shrink-0"
		>
			<Logo />
	</header>

	<main class="flex-1 flex flex-col items-center w-full min-h-0 pt-8 pb-4">
		<div class="my-auto w-full flex flex-col items-center justify-center relative">
			<HeroText />
			<SubscribeForm data={data.form} />
		</div>
	</main>

	<AppFooter />
</div>
