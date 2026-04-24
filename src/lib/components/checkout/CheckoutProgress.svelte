<script lang="ts">
	let { currentStep = 1 }: { currentStep: number } = $props();
	const steps = ['Contact', 'Address', 'Shipping', 'Payment'];
</script>

<div class="py-6 md:py-8 lg:py-10">
	<!-- Mobile Dots -->
	<div class="flex justify-center gap-2 md:hidden">
		{#each Array(4) as _, i}
			<div
				class="h-2 rounded-full transition-all duration-300
        {currentStep === i + 1
					? 'w-4 bg-volt'
					: currentStep > i + 1
						? 'w-2 bg-bone'
						: 'w-2 bg-charcoal'}"
			></div>
		{/each}
	</div>

	<!-- Desktop Steps -->
	<div class="mx-auto hidden max-w-2xl items-center justify-center gap-0 px-4 md:flex">
		{#each steps as step, i}
			<div class="group flex flex-1 items-center last:flex-none">
				<div class="relative flex flex-col items-center">
					<div
						class="h-2.5 w-2.5 rounded-full transition-all duration-300
            {currentStep === i + 1
							? 'bg-volt ring-4 ring-volt/10'
							: currentStep > i + 1
								? 'bg-bone'
								: 'bg-charcoal'}"
					></div>
					<span
						class="absolute top-6 font-mono text-[9px] tracking-widest whitespace-nowrap uppercase
            {currentStep === i + 1 ? 'font-bold text-bone' : 'text-ash'}"
					>
						{step}
					</span>
				</div>

				{#if i < steps.length - 1}
					<div class="mx-4 h-px flex-1 bg-charcoal">
						<div
							class="h-full bg-bone transition-all duration-500"
							style="width: {currentStep > i + 1 ? '100%' : '0%'}"
						></div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
