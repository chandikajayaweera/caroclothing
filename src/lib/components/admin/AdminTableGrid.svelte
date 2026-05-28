<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';

	let {
		items,
		headers,
		row,
		card,
		gridClass = 'grid gap-3 p-3 md:grid-cols-2 md:p-4 xl:hidden'
	}: {
		items: T[];
		headers: { label: string; class?: string }[];
		row: Snippet<[T]>;
		card: Snippet<[T]>;
		gridClass?: string;
	} = $props();
</script>

{#if items.length > 0}
	<!-- Mobile/Tablet Card Grid -->
	<div class={gridClass}>
		{#each items as item (item.id)}
			{@render card(item)}
		{/each}
	</div>

	<!-- Desktop Table View -->
	<div class="hidden overflow-hidden xl:block">
		<table class="w-full text-left">
			<thead class="border-b border-charcoal">
				<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
					{#each headers as header}
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
