<script lang="ts">
	const lines = ['FROM COLOMBO', 'TO EVERYWHERE.'];
	const footnote = 'Sri Lankan-made. Global vision. Est. 2024.';
</script>

<section class="bg-charcoal py-16 md:py-24 lg:py-32 px-5 md:px-8 lg:px-12 relative overflow-hidden">
	<!-- Optional texture/background -->
	<img
		src="/images/editorial.png"
		alt=""
		class="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none"
	/>

	<div class="max-w-7xl mx-auto relative z-10">
		<div class="flex flex-col gap-2 md:gap-4">
			<h2 class="font-display text-[60px] md:text-[90px] lg:text-[130px] leading-[0.9] text-bone uppercase">
				{lines[0]}
			</h2>
			<h2 class="font-display text-[60px] md:text-[90px] lg:text-[130px] leading-[0.9] text-volt uppercase">
				{lines[1]}
			</h2>
		</div>
		<p class="font-mono text-xs text-ash mt-6 md:mt-10 uppercase tracking-[0.1em]">
			{footnote}
		</p>
	</div>
</section>
