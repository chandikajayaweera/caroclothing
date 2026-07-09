<script lang="ts">
	const steps = [
		{ label: 'Order Placed', done: true, date: 'Apr 20, 2:32pm' },
		{ label: 'Confirmed', done: true, date: 'Apr 20, 3:15pm' },
		{ label: 'Packed', done: true, date: 'Apr 21, 10:00am' },
		{ label: 'Shipped', done: false, date: null },
		{ label: 'Delivered', done: false, date: null }
	];

	const currentStepIndex = steps.findIndex((s) => !s.done) - 1;
</script>

<div class="mt-8 flex flex-col gap-0">
	{#each steps as step, i (step.label)}
		<div class="relative flex items-start gap-4 pb-8 last:pb-0">
			<!-- Connecting line -->
			{#if i < steps.length - 1}
				<div class="absolute top-4 left-[5.5px] h-full w-px bg-charcoal">
					<div
						class="w-full bg-volt transition-all duration-500"
						style="height: {step.done && steps[i + 1].done ? '100%' : '0%'}"
					></div>
				</div>
			{/if}

			<!-- Dot -->
			<div
				class="z-10 mt-0.5 h-3 w-3 shrink-0 rounded-full transition-all duration-300
        {step.done
					? 'bg-volt'
					: i === currentStepIndex + 1
						? 'animate-pulse bg-volt ring-4 ring-volt/20'
						: 'bg-ash/20'}"
			></div>

			<!-- Label + Date -->
			<div class="flex flex-col gap-0.5">
				<span
					class="font-mono text-xs tracking-widest uppercase
          {step.done ? 'text-bone' : 'text-ash/40'}"
				>
					{step.label}
				</span>
				{#if step.date}
					<span class="font-mono text-[9px] tracking-widest text-ash/60 uppercase">
						{step.date}
					</span>
				{/if}
			</div>
		</div>
	{/each}
</div>
