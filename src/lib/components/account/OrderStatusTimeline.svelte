<script lang="ts">
	const steps = [
		{ label: 'Order Placed', done: true, date: 'Apr 20, 2:32pm' },
		{ label: 'Confirmed', done: true, date: 'Apr 20, 3:15pm' },
		{ label: 'Packed', done: true, date: 'Apr 21, 10:00am' },
		{ label: 'Shipped', done: false, date: null },
		{ label: 'Delivered', done: false, date: null }
	];

	const currentStepIndex = steps.findIndex(s => !s.done) - 1;
</script>

<div class="flex flex-col gap-0 mt-8">
	{#each steps as step, i}
		<div class="flex gap-4 items-start relative pb-8 last:pb-0">
			<!-- Connecting line -->
			{#if i < steps.length - 1}
				<div
					class="absolute left-[5.5px] top-4 w-[1px] h-full bg-charcoal"
				>
					<div
						class="w-full bg-volt transition-all duration-500"
						style="height: {step.done && steps[i+1].done ? '100%' : '0%'}"
					></div>
				</div>
			{/if}

			<!-- Dot -->
			<div
				class="w-3 h-3 rounded-full mt-0.5 flex-shrink-0 z-10 transition-all duration-300
        {step.done ? 'bg-volt' : i === currentStepIndex + 1 ? 'bg-volt ring-4 ring-volt/20 animate-pulse' : 'bg-ash/20'}"
			></div>

			<!-- Label + Date -->
			<div class="flex flex-col gap-0.5">
				<span
					class="font-mono text-xs uppercase tracking-widest
          {step.done ? 'text-bone' : 'text-ash/40'}"
				>
					{step.label}
				</span>
				{#if step.date}
					<span class="font-mono text-[9px] text-ash/60 uppercase tracking-widest">
						{step.date}
					</span>
				{/if}
			</div>
		</div>
	{/each}
</div>
