<script lang="ts">
	import { Search } from 'lucide-svelte';

	let {
		value = $bindable(''),
		name = 'query',
		placeholder = 'Search by name or slug...',
		loading = false,
		onchange
	}: {
		value?: string;
		name?: string;
		placeholder?: string;
		loading?: boolean;
		onchange?: (event: Event) => void;
	} = $props();
</script>

<div class="relative min-w-0 flex-1">
	<input
		type="text"
		{name}
		{placeholder}
		bind:value
		disabled={loading}
		{onchange}
		aria-label="Search records"
		enterkeyhint="search"
		class="min-h-11 w-full border border-ash/30 bg-void py-2.5 pr-14 pl-4 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:opacity-50 md:pr-28"
	/>
	<button
		type="submit"
		disabled={loading}
		aria-label="Search"
		title="Search"
		class="absolute inset-y-px right-px flex w-11 cursor-pointer items-center justify-center gap-2 border-l border-ash/30 bg-charcoal/40 text-ash transition-colors hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 md:w-auto md:min-w-24 md:px-3"
	>
		<Search size={15} aria-hidden="true" />
		<span class="hidden font-mono text-[10px] font-bold tracking-widest uppercase md:inline">
			Search
		</span>
	</button>
</div>
