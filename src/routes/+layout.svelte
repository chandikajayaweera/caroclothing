<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.png';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import CartDrawer from '$lib/components/cart/CartDrawer.svelte';
	import Toast from '$lib/components/shared/Toast.svelte';
	import BottomNav from '$lib/components/layout/BottomNav.svelte';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';

	let { children } = $props();

	const showFooterRoutes = ['/', '/about'];
	const shouldShowFooter = $derived(showFooterRoutes.includes(page.url.pathname));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div
	class="relative flex min-h-screen flex-col overflow-x-hidden selection:bg-volt selection:text-void"
>
	<Navbar />
	<BottomNav />

	<CartDrawer />
	<Toast />

	<main class="grow pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0">
		{#key page.url.pathname}
			<main in:fly={{ delay: 100, x: 10 }}>
				{@render children()}
			</main>
		{/key}
	</main>

	{#if shouldShowFooter}
		<Footer />
	{/if}
</div>
