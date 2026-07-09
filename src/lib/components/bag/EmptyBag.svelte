<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	let {
		onShopClick
	}: {
		onShopClick?: () => void;
	} = $props();
</script>

<div class="flex flex-col items-center justify-center text-center">
	<span class="mb-2 font-display text-3xl text-bone uppercase md:text-4xl">Your bag is empty.</span>
	<span class="mb-6 font-mono text-xs tracking-widest text-ash/50 uppercase">Fix that.</span>
	<Button variant="primary" onclick={onShopClick} href="/shop?sort=new">Shop New In →</Button>
</div>
