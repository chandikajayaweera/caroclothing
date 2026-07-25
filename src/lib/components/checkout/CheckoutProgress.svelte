<script lang="ts">
	let {
		currentStep = 1,
		steps = ['Delivery', 'Shipping', 'Payment']
	}: {
		currentStep?: number;
		steps?: string[];
	} = $props();
</script>

<nav aria-label="Checkout progress" class="py-5 md:py-7">
	<p class="mb-3 font-mono text-[10px] tracking-[0.18em] text-ash uppercase md:hidden">
		Step {currentStep} of {steps.length}: {steps[currentStep - 1]}
	</p>

	<ol class="flex items-start">
		{#each steps as step, index (step)}
			<li
				class="flex min-w-0 flex-1 items-start last:flex-none"
				aria-current={currentStep === index + 1 ? 'step' : undefined}
			>
				<div class="flex min-w-0 flex-col gap-2">
					<div
						class="flex h-7 w-7 items-center justify-center border font-mono text-[10px] font-bold transition-colors
						{currentStep > index + 1
							? 'border-bone bg-bone text-void'
							: currentStep === index + 1
								? 'border-volt bg-volt text-void'
								: 'border-charcoal text-ash'}"
					>
						{currentStep > index + 1 ? 'OK' : index + 1}
					</div>
					<span
						class="hidden font-mono text-[9px] tracking-[0.16em] uppercase md:block
						{currentStep === index + 1 ? 'text-bone' : 'text-ash'}"
					>
						{step}
					</span>
				</div>

				{#if index < steps.length - 1}
					<div class="mx-3 mt-3 h-px min-w-8 flex-1 bg-charcoal md:mx-5">
						<div
							class="h-full bg-bone transition-[width] duration-300"
							style:width={currentStep > index + 1 ? '100%' : '0%'}
						></div>
					</div>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
