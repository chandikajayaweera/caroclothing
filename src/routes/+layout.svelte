<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.png';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import CartDrawer from '$lib/components/cart/CartDrawer.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import BottomNav from '$lib/components/layout/BottomNav.svelte';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col selection:bg-volt selection:text-void relative overflow-x-hidden">
	<Navbar />
	<BottomNav />
	<CartDrawer />
	<Toast />

	<main class="grow pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0">
		{#key page.url.pathname}
			{@render children()}
		{/key}
	</main>

	<Footer />
</div>

