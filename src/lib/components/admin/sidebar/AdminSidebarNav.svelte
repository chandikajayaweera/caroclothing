<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { navGroups } from './admin-nav';

	let {
		collapsed = false,
		onClose = () => {}
	}: {
		collapsed?: boolean;
		onClose?: () => void;
	} = $props();

	const isActive = (href: string) =>
		href === '/app' ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

<nav class="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5">
	{#each navGroups as group (group.label)}
		<div class="mb-6">
			{#if !collapsed}
				<p class="mb-2 px-3 font-mono text-[8px] tracking-[0.2em] text-ash/40 uppercase">
					{group.label}
				</p>
			{/if}
			<div class="flex flex-col gap-1">
				{#each group.items as item (item.href)}
					{@const Icon = item.icon}
					<a
						href={resolve(item.href)}
						class="group flex h-11 items-center gap-3 border-l-2 px-3 font-mono text-[10px] tracking-widest uppercase transition-colors {isActive(
							item.href
						)
							? 'border-volt bg-charcoal/60 text-volt'
							: 'border-transparent text-ash hover:bg-charcoal/40 hover:text-bone'} {collapsed
							? 'lg:justify-center'
							: 'lg:justify-start'} cursor-pointer"
						onclick={onClose}
						aria-label={collapsed ? item.label : undefined}
						title={collapsed ? item.label : undefined}
					>
						<Icon size={18} aria-hidden="true" />
						{#if !collapsed}
							<span>{item.label}</span>
						{/if}
					</a>
				{/each}
			</div>
		</div>
	{/each}
</nav>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
