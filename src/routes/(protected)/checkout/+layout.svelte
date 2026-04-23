<script lang="ts">
	import '../layout.css';
	let { children } = $props();
</script>

<div class="min-h-screen bg-void text-bone selection:bg-volt selection:text-void">
	<!-- Dark theme for checkout — consistent with brand -->
	<header class="flex justify-center border-b border-charcoal py-6">
		<a href="/">
			<span class="font-display text-3xl tracking-[0.2em] text-bone">CARO</span>
		</a>
	</header>

	<main>
		{@render children()}
	</main>
</div>
