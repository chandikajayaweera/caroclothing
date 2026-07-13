<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';

	let {
		items,
		headers,
		row,
		card,
		gridClass = 'grid grid-cols-[minmax(0,1fr)] gap-3 p-3 md:grid-cols-[repeat(2,minmax(0,1fr))] md:p-4 xl:hidden',
		tableClass = 'hidden overflow-x-auto xl:block'
	}: {
		items: T[];
		headers: { label: string; class?: string }[];
		row?: Snippet<[T]>;
		card?: Snippet<[T]>;
		gridClass?: string;
		tableClass?: string;
	} = $props();

	const tableMinWidth = $derived(Math.max(640, headers.length * 140));
</script>

{#if items.length > 0 && card && row}
	<!-- Mobile/Tablet Card Grid -->
	<div class={gridClass}>
		{#each items as item (item.id)}
			<div class="min-w-0">
				{@render card(item)}
			</div>
		{/each}
	</div>

	<!-- Desktop Table View -->
	<div class={tableClass}>
		<table class="w-full text-left" style:min-width={`${tableMinWidth}px`}>
			<thead class="border-b border-charcoal">
				<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
					{#each headers as header (header.label)}
						<th class="px-5 py-4 font-normal {header.class || ''}">{header.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@render row(item)}
				{/each}
			</tbody>
		</table>
	</div>
{/if}
