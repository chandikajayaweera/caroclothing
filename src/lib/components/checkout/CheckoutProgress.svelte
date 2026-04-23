<script lang="ts">
	let { currentStep = 1 }: { currentStep: number } = $props();
	const steps = ['Contact', 'Address', 'Shipping', 'Payment'];
</script>

<div class="py-6 md:py-8 lg:py-10">
	<!-- Mobile Dots -->
	<div class="flex md:hidden justify-center gap-2">
		{#each Array(4) as _, i}
			<div
				class="transition-all duration-300 rounded-full
        {currentStep === i + 1 ? 'w-4 h-2 bg-void' : 
         currentStep > i + 1 ? 'w-2 h-2 bg-void' : 
         'w-2 h-2 bg-void/20'}"
			></div>
		{/each}
	</div>

	<!-- Desktop Steps -->
	<div class="hidden md:flex items-center justify-center gap-0 max-w-2xl mx-auto px-4">
		{#each steps as step, i}
			<div class="flex items-center flex-1 last:flex-none group">
				<div class="flex flex-col items-center relative">
					<div
						class="w-2.5 h-2.5 rounded-full transition-all duration-300
            {currentStep === i + 1 ? 'bg-void ring-4 ring-void/10' : 
             currentStep > i + 1 ? 'bg-void' : 
             'bg-void/20'}"
					></div>
					<span
						class="absolute top-6 whitespace-nowrap font-mono text-[9px] uppercase tracking-widest
            {currentStep === i + 1 ? 'text-void font-bold' : 'text-void/40'}"
					>
						{step}
					</span>
				</div>
				
				{#if i < steps.length - 1}
					<div class="flex-1 h-[1px] bg-void/10 mx-4">
						<div
							class="h-full bg-void transition-all duration-500"
							style="width: {currentStep > i + 1 ? '100%' : '0%'}"
						></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
