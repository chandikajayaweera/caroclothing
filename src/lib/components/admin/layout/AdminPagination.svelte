<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let {
		offset = 0,
		limit = 10,
		totalItems = 0,
		offsetParam = 'offset'
	}: {
		offset?: number;
		limit?: number;
		totalItems?: number;
		offsetParam?: string;
	} = $props();

	const hasPreviousPage = $derived(offset > 0);
	const hasNextPage = $derived(offset + limit < totalItems);

	function getPageSearch(newOffset: number): string {
		const url = new URL(page.url);
		url.searchParams.set(offsetParam, String(newOffset));
		return url.search;
	}
</script>

<div
	class="flex flex-col gap-3 border-t border-charcoal p-5 font-mono text-[10px] tracking-widest text-ash uppercase sm:flex-row sm:items-center sm:justify-between"
>
	<p>
		Showing {offset + 1}-{Math.min(offset + limit, totalItems)} of {totalItems}
	</p>
	<div class="flex gap-2">
		{#if hasPreviousPage}
			<a
				href={resolve(`${page.url.pathname}${getPageSearch(offset - limit)}` as '/')}
				class="inline-flex min-h-11 items-center justify-center border border-ash/30 px-4 py-2 transition-colors hover:border-volt hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
			>
				Previous
			</a>
		{/if}
		{#if hasNextPage}
			<a
				href={resolve(`${page.url.pathname}${getPageSearch(offset + limit)}` as '/')}
				class="inline-flex min-h-11 items-center justify-center border border-ash/30 px-4 py-2 transition-colors hover:border-volt hover:text-volt focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
			>
				Next
			</a>
		{/if}
	</div>
</div>
