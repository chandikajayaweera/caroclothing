<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import AdminPageShell from '$lib/components/admin/layout/AdminPageShell.svelte';
	import AdminPageHeader from '$lib/components/admin/layout/AdminPageHeader.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';

	let { data, form }: { data: PageData; form?: ActionData } = $props();
	function movedIds(index: number, direction: -1 | 1) {
		const ids = data.sections.map((item) => item.id);
		const target = index + direction;
		if (target < 0 || target >= ids.length) return ids;
		[ids[index], ids[target]] = [ids[target], ids[index]];
		return ids;
	}
	function statusTone(status: PageData['sections'][number]['visibilityStatus']) {
		return status === 'live'
			? 'success'
			: status === 'scheduled'
				? 'info'
				: status === 'ended'
					? 'warning'
					: 'neutral';
	}
</script>

<AdminPageShell>
	<AdminPageHeader
		kicker="Storefront"
		title="Homepage sections"
		description="Control bounded content blocks, sources, schedule, media, and order."
	>
		{#snippet actions()}<AdminButton href="/app/storefront/new" variant="volt"
				><Plus size={14} /> New section</AdminButton
			>{/snippet}
	</AdminPageHeader>
	{#if form}<p
			role="status"
			class="mt-5 border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
		>
			Storefront updated.
		</p>{/if}
	<div class="mt-7 grid gap-3">
		{#each data.sections as section, index (section.id)}
			<article
				class="grid gap-4 border border-charcoal bg-charcoal/20 p-4 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center"
			>
				<div
					class="grid aspect-square place-items-center bg-charcoal font-display text-3xl text-volt"
				>
					{index + 1}
				</div>
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<h2 class="truncate font-sans text-sm font-semibold text-bone">{section.adminName}</h2>
						<AdminBadge variant={statusTone(section.visibilityStatus)}
							>{section.visibilityStatus}</AdminBadge
						>
					</div>
					<p class="mt-1 font-mono text-[10px] tracking-widest text-ash uppercase">
						{section.type.replaceAll('_', ' ')} · {section.sourceType.replaceAll('_', ' ')} · {section.layoutVariant.replaceAll(
							'_',
							' '
						)}
					</p>
					{#if section.title}<p class="mt-2 truncate text-xs text-ash/70">{section.title}</p>{/if}
				</div>
				<div class="flex flex-wrap items-center gap-2 md:justify-end">
					<form method="POST" action="?/reorder">
						<input type="hidden" name="pageKey" value="home" />
						{#each movedIds(index, -1) as id (id)}<input
								type="hidden"
								name="sectionIds"
								value={id}
							/>{/each}
						<AdminButton
							type="submit"
							variant="outline"
							size="icon"
							disabled={index === 0}
							aria-label="Move up"><ArrowUp size={15} /></AdminButton
						>
					</form>
					<form method="POST" action="?/reorder">
						<input type="hidden" name="pageKey" value="home" />
						{#each movedIds(index, 1) as id (id)}<input
								type="hidden"
								name="sectionIds"
								value={id}
							/>{/each}
						<AdminButton
							type="submit"
							variant="outline"
							size="icon"
							disabled={index === data.sections.length - 1}
							aria-label="Move down"><ArrowDown size={15} /></AdminButton
						>
					</form>
					<form method="POST" action="?/toggle">
						<input type="hidden" name="sectionId" value={section.id} /><input
							type="hidden"
							name="enabled"
							value={section.enabled ? 'false' : 'true'}
						/><AdminButton type="submit" variant="outline" size="sm"
							>{section.enabled ? 'Disable' : 'Enable'}</AdminButton
						>
					</form>
					<AdminButton
						href={`/app/storefront/${section.id}/edit`}
						variant="charcoal"
						size="icon"
						aria-label="Edit section"><Pencil size={15} /></AdminButton
					>
					<a
						href={resolve(`/#${section.id}` as '/')}
						class="grid h-11 w-11 place-items-center border border-ash/30 text-ash hover:border-volt hover:text-volt"
						aria-label="Preview homepage"><Eye size={15} /></a
					>
					<form method="POST" action="?/delete">
						<input type="hidden" name="sectionId" value={section.id} /><AdminButton
							type="submit"
							variant="danger"
							size="icon"
							aria-label="Delete section"><Trash2 size={15} /></AdminButton
						>
					</form>
				</div>
			</article>
		{:else}
			<div class="border border-dashed border-ash/20 px-6 py-16 text-center">
				<p class="font-display text-5xl text-bone uppercase">No homepage sections</p>
				<p class="mt-2 text-sm text-ash">Create the first bounded section.</p>
			</div>
		{/each}
	</div>
</AdminPageShell>
