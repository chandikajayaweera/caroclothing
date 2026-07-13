<script lang="ts">
	import { resolve } from '$app/paths';

	export type AdminTabItem = {
		value: string;
		label: string;
		href?: string;
		count?: number;
		disabled?: boolean;
	};

	let {
		items,
		value,
		label = 'Page views',
		onchange,
		class: className = ''
	}: {
		items: AdminTabItem[];
		value: string;
		label?: string;
		onchange?: (value: string) => void;
		class?: string;
	} = $props();

	const itemClasses = (active: boolean, disabled = false) =>
		`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border px-4 font-mono text-[10px] font-bold tracking-widest uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
			active
				? 'border-volt bg-volt text-void'
				: 'border-ash/25 bg-void text-ash hover:border-volt hover:text-bone'
		} ${disabled ? 'pointer-events-none cursor-not-allowed opacity-40' : ''}`;
</script>

<nav class="max-w-full overflow-x-auto pb-1 {className}" aria-label={label}>
	<div class="flex min-w-max gap-1" role="tablist" aria-label={label}>
		{#each items as item (item.value)}
			{@const active = item.value === value}
			{#if item.href}
				<a
					href={resolve(item.href as '/')}
					class={itemClasses(active, item.disabled)}
					role="tab"
					aria-selected={active}
					aria-current={active ? 'page' : undefined}
					aria-disabled={item.disabled}
				>
					<span>{item.label}</span>
					{#if item.count !== undefined}
						<span class="border border-current/25 px-1.5 py-0.5 text-[8px]">{item.count}</span>
					{/if}
				</a>
			{:else}
				<button
					type="button"
					class={itemClasses(active, item.disabled)}
					role="tab"
					aria-selected={active}
					disabled={item.disabled}
					onclick={() => onchange?.(item.value)}
				>
					<span>{item.label}</span>
					{#if item.count !== undefined}
						<span class="border border-current/25 px-1.5 py-0.5 text-[8px]">{item.count}</span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
</nav>
