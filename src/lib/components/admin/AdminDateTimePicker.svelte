<script lang="ts">
	import { DatePicker, Label } from 'bits-ui';
	import { Calendar, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { CalendarDateTime } from '@internationalized/date';

	let {
		label,
		name,
		value = $bindable(null),
		minValue = null,
		required = false,
		disabled = false,
		error,
		class: className = '',
		...rest
	}: {
		label?: string;
		name: string;
		value?: number | null;
		minValue?: number | null;
		required?: boolean;
		disabled?: boolean;
		error?: string | string[];
		class?: string;
		[key: string]: any;
	} = $props();

	const errorMessage = $derived(
		Array.isArray(error) ? error[0] : typeof error === 'string' ? error : undefined
	);

	// Helper to convert UNIX timestamp to CalendarDateTime
	function toCalendarDateTime(timestamp: number | null | undefined): CalendarDateTime | undefined {
		if (timestamp === null || timestamp === undefined) return undefined;
		const d = new Date(timestamp);
		if (isNaN(d.getTime())) return undefined;
		return new CalendarDateTime(
			d.getFullYear(),
			d.getMonth() + 1,
			d.getDate(),
			d.getHours(),
			d.getMinutes()
		);
	}

	// Helper to convert CalendarDateTime to UNIX timestamp
	function toTimestamp(calVal: CalendarDateTime | undefined | null): number | null {
		if (!calVal) return null;
		const d = new Date(calVal.year, calVal.month - 1, calVal.day, calVal.hour, calVal.minute);
		return d.getTime();
	}

	// Internal state mapped from bindable value
	let internalValue = $state<any>(toCalendarDateTime(value));

	// Sync value -> internalValue
	$effect(() => {
		const expected = toCalendarDateTime(value);
		if (
			(!internalValue && expected) ||
			(internalValue && !expected) ||
			(internalValue &&
				expected &&
				(internalValue.year !== expected.year ||
					internalValue.month !== expected.month ||
					internalValue.day !== expected.day ||
					internalValue.hour !== expected.hour ||
					internalValue.minute !== expected.minute))
		) {
			internalValue = expected;
		}
	});

	// Sync internalValue -> value
	$effect(() => {
		const newTimestamp = toTimestamp(internalValue);
		if (newTimestamp !== value) {
			value = newTimestamp;
		}
	});

	// Calendar viewport/placeholder state
	let placeholder = $state<any>(
		toCalendarDateTime(value) ||
			(() => {
				const now = new Date();
				return new CalendarDateTime(
					now.getFullYear(),
					now.getMonth() + 1,
					now.getDate(),
					now.getHours(),
					now.getMinutes()
				);
			})()
	);
	const minCalValue = $derived(toCalendarDateTime(minValue));
</script>

<div class="grid gap-1 {className}">
	{#if label}
		<Label.Root class="flex items-center font-sans text-xs font-semibold tracking-wide text-ash/90">
			{label}
			{#if required}
				<span class="ml-0.5 font-sans text-red-400" title="Required">*</span>
			{/if}
		</Label.Root>
	{/if}

	<!-- Hidden input for standard HTML form submission -->
	<input type="hidden" {name} value={value ?? ''} />

	<DatePicker.Root
		value={internalValue}
		onValueChange={(v) => {
			internalValue = v as any;
			value = toTimestamp(v as any);
		}}
		bind:placeholder
		hourCycle={24}
		minValue={minCalValue as any}
		{disabled}
	>
		<DatePicker.Input
			class="flex min-h-11 w-full items-center border bg-void px-3.5 py-3 font-sans text-sm text-bone transition-colors outline-none focus-within:border-volt hover:border-ash/60 disabled:cursor-not-allowed disabled:opacity-40 {errorMessage
				? 'border-red-400/50'
				: 'border-ash/30'}"
			{...rest}
		>
			{#snippet children({ segments })}
				{#each segments as { part, value: segmentVal }}
					{#if part === 'literal'}
						<DatePicker.Segment {part} class="p-0.5 text-ash/40 select-none">
							{segmentVal}
						</DatePicker.Segment>
					{:else}
						<DatePicker.Segment
							{part}
							class="rounded-sm px-0.5 py-0.5 text-bone transition-colors outline-none hover:bg-ash/10 focus:bg-volt focus:text-void aria-[valuetext=Empty]:text-ash/40"
						>
							{segmentVal}
						</DatePicker.Segment>
					{/if}
				{/each}
				<DatePicker.Trigger
					class="ml-auto inline-flex size-6 items-center justify-center text-ash/60 transition-colors hover:text-volt focus:outline-none focus-visible:text-volt"
				>
					<Calendar size={16} />
				</DatePicker.Trigger>
			{/snippet}
		</DatePicker.Input>

		<DatePicker.Portal>
			<DatePicker.Content
				class="z-50 border border-charcoal bg-charcoal p-4 shadow-xl outline-none"
				sideOffset={4}
			>
				<DatePicker.Calendar>
					{#snippet children({ months, weekdays })}
						<DatePicker.Header
							class="mb-3 flex items-center justify-between border-b border-charcoal/60 pb-3"
						>
							<DatePicker.PrevButton
								class="grid h-8 w-8 place-items-center border border-ash/20 bg-void text-ash transition-colors hover:border-volt hover:text-volt"
							>
								<ChevronLeft size={16} />
							</DatePicker.PrevButton>
							<DatePicker.Heading
								class="font-mono text-xs font-bold tracking-widest text-bone uppercase"
							/>
							<DatePicker.NextButton
								class="grid h-8 w-8 place-items-center border border-ash/20 bg-void text-ash transition-colors hover:border-volt hover:text-volt"
							>
								<ChevronRight size={16} />
							</DatePicker.NextButton>
						</DatePicker.Header>

						<div class="flex flex-col gap-4 sm:flex-row">
							{#each months as month}
								<DatePicker.Grid class="w-full border-collapse">
									<DatePicker.GridHead>
										<DatePicker.GridRow class="mb-1 flex w-full">
											{#each weekdays as day}
												<DatePicker.HeadCell
													class="w-8 text-center font-sans text-[10px] font-medium text-ash/60 uppercase"
												>
													{day.slice(0, 2)}
												</DatePicker.HeadCell>
											{/each}
										</DatePicker.GridRow>
									</DatePicker.GridHead>
									<DatePicker.GridBody class="space-y-1">
										{#each month.weeks as weekDates}
											<DatePicker.GridRow class="flex w-full">
												{#each weekDates as date}
													<DatePicker.Cell
														{date}
														month={month.value}
														class="relative h-8 w-8 p-0 text-center"
													>
														<DatePicker.Day
															class="flex h-full w-full cursor-pointer items-center justify-center font-mono text-xs text-bone transition-colors hover:bg-ash/10 hover:text-volt focus:outline-none focus-visible:ring-1 focus-visible:ring-volt
															data-[disabled]:pointer-events-none data-[disabled]:text-ash/20 data-[outside-month]:text-ash/30
															data-[selected]:bg-volt data-[selected]:font-bold data-[selected]:text-void"
														/>
													</DatePicker.Cell>
												{/each}
											</DatePicker.GridRow>
										{/each}
									</DatePicker.GridBody>
								</DatePicker.Grid>
							{/each}
						</div>
					{/snippet}
				</DatePicker.Calendar>
			</DatePicker.Content>
		</DatePicker.Portal>
	</DatePicker.Root>

	{#if errorMessage}
		<span class="mt-0.5 font-sans text-xs text-red-400">
			{errorMessage}
		</span>
	{/if}
</div>
