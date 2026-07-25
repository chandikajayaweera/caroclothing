<script lang="ts">
	import type { Snippet } from 'svelte';
	import AdminActionMenu, {
		type AdminActionMenuItem
	} from '$lib/components/admin/overlays/AdminActionMenu.svelte';

	let {
		views,
		primary,
		menuItems = [],
		menuLabel = 'More',
		ariaLabel = 'Page actions',
		class: className = ''
	}: {
		views?: Snippet;
		primary?: Snippet;
		menuItems?: AdminActionMenuItem[];
		menuLabel?: string;
		ariaLabel?: string;
		class?: string;
	} = $props();
</script>

<div class="grid w-full min-w-0 gap-2 md:flex md:w-auto md:items-center md:justify-end {className}">
	{#if views}
		<div class="min-w-0 md:mr-1">
			{@render views()}
		</div>
	{/if}

	{#if primary || menuItems.length > 0}
		<div class="flex min-w-0 items-center gap-2">
			{#if primary}
				<div class="min-w-0 flex-1 min-[430px]:flex-none [&>*]:w-full min-[430px]:[&>*]:w-auto">
					{@render primary()}
				</div>
			{/if}
			{#if menuItems.length > 0}
				<AdminActionMenu
					items={menuItems}
					label={primary ? menuLabel : 'Actions'}
					{ariaLabel}
					class={primary ? 'shrink-0' : 'flex-1 min-[430px]:flex-none'}
				/>
			{/if}
		</div>
	{/if}
</div>
