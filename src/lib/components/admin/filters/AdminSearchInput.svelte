<script lang="ts">
	import { Search } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';

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

<div class="flex flex-1 items-center gap-2">
	<div class="relative flex-1">
		<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ash/50">
			<Search size={14} aria-hidden="true" />
		</div>
		<input
			type="text"
			{name}
			{placeholder}
			bind:value
			disabled={loading}
			{onchange}
			aria-label="Search records"
			class="min-h-11 w-full border border-ash/30 bg-void py-2.5 pr-4 pl-10 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt disabled:opacity-50"
		/>
	</div>
	<AdminButton type="submit" disabled={loading} variant="outline" class="shrink-0">
		Search
	</AdminButton>
</div>
