<script lang="ts">
	import '../layout.css';
	let { children } = $props();
</script>

<div class="min-h-screen bg-bone text-void selection:bg-void selection:text-bone">
	<!-- Bone/light theme for checkout — safe, transactional feel -->
	<header class="flex justify-center border-b border-void/10 py-6">
		<a href="/">
			<span class="font-display text-3xl text-void tracking-[0.2em]">CARO</span>
		</a>
	</header>
	
	<main>
		{@render children()}
	</main>
</div>
