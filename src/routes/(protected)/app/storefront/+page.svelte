<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowDown,
		ArrowUp,
		Eye,
		LayoutTemplate,
		Pencil,
		Plus,
		Power,
		Trash2
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminRowActions from '$lib/components/admin/data-display/AdminRowActions.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminConfirmDialog from '$lib/components/admin/overlays/AdminConfirmDialog.svelte';
	import { formatAdminDateTime } from '$lib/shared/admin/format';
	import type { BadgeVariant } from '$lib/shared/admin/status';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	type StorefrontSection = PageData['sections'][number];

	const tableHeaders = [
		{ label: 'Order' },
		{ label: 'Section' },
		{ label: 'Content source' },
		{ label: 'Visibility' },
		{ label: 'Actions', class: 'text-right' }
	];

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		message: toggleMessage,
		enhance: toggleEnhance,
		submitting: toggleSubmitting
	} = superForm(
		initialForm(() => data.toggleForm),
		{ resetForm: false }
	);
	const {
		message: reorderMessage,
		enhance: reorderEnhance,
		submitting: reorderSubmitting
	} = superForm(
		initialForm(() => data.reorderForm),
		{ resetForm: false }
	);
	const {
		message: deleteMessage,
		enhance: deleteEnhance,
		submitting: deleteSubmitting
	} = superForm(
		initialForm(() => data.deleteForm),
		{ resetForm: false }
	);

	const actionMessage = $derived(
		actionData?.form?.message ?? $toggleMessage ?? $reorderMessage ?? $deleteMessage
	);
	const metrics = $derived([
		{
			label: 'Total sections',
			value: data.sections.length,
			description: 'Homepage order',
			tone: 'neutral' as const
		},
		{
			label: 'Live',
			value: data.sections.filter((item) => item.visibilityStatus === 'live').length,
			description: 'Visible now',
			tone: 'success' as const
		},
		{
			label: 'Scheduled',
			value: data.sections.filter((item) => item.visibilityStatus === 'scheduled').length,
			description: 'Starts later',
			tone: 'info' as const
		},
		{
			label: 'Disabled',
			value: data.sections.filter((item) => item.visibilityStatus === 'disabled').length,
			description: 'Not published',
			tone: 'neutral' as const
		}
	]);

	let deleteDialogOpen = $state(false);
	let deleteCandidate = $state<StorefrontSection | null>(null);
	let deleteFormElement = $state<HTMLFormElement | null>(null);

	function movedIds(index: number, direction: -1 | 1): string[] {
		const ids = data.sections.map((item) => item.id);
		const target = index + direction;
		if (target < 0 || target >= ids.length) return ids;
		[ids[index], ids[target]] = [ids[target], ids[index]];
		return ids;
	}

	function statusTone(status: StorefrontSection['visibilityStatus']): BadgeVariant {
		if (status === 'live') return 'success';
		if (status === 'scheduled') return 'info';
		if (status === 'ended') return 'warning';
		return 'neutral';
	}

	function scheduleLabel(section: StorefrontSection): string {
		if (section.visibilityStatus === 'scheduled') {
			return `Starts ${formatAdminDateTime(section.startsAt)}`;
		}
		if (section.visibilityStatus === 'ended') {
			return `Ended ${formatAdminDateTime(section.endsAt)}`;
		}
		if (section.visibilityStatus === 'live' && section.endsAt) {
			return `Ends ${formatAdminDateTime(section.endsAt)}`;
		}
		return section.enabled ? 'No end date' : 'Enable when ready';
	}

	function homepageHref(sectionId: string): string {
		return `${resolve('/')}#${encodeURIComponent(sectionId)}`;
	}

	function requestDelete(section: StorefrontSection, event: MouseEvent) {
		deleteCandidate = section;
		deleteFormElement = (event.currentTarget as HTMLElement).closest('form');
		deleteDialogOpen = true;
	}

	function confirmDelete() {
		deleteFormElement?.requestSubmit();
		deleteDialogOpen = false;
	}
</script>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<AdminListLayout
	kicker="Storefront"
	title="Homepage sections"
	description="Control bounded content blocks, content sources, publishing windows, media, and display order."
	{actionMessage}
	{metrics}
	showSearch={false}
	totalItems={data.sections.length}
	limit={Math.max(1, data.sections.length)}
	offset={0}
	{tableHeaders}
	items={data.sections}
>
	{#snippet headerActions()}
		<AdminButton href={resolve('/app/storefront/new')} variant="volt" size="md">
			<Plus size={14} aria-hidden="true" />
			New section
		</AdminButton>
	{/snippet}

	{#snippet card(section: StorefrontSection)}
		{@const index = data.sections.findIndex((item) => item.id === section.id)}
		<AdminEntityCard>
			{#snippet media()}
				<div
					class="grid aspect-square place-items-center border border-charcoal bg-void font-display text-3xl text-volt"
					aria-label={`Position ${index + 1}`}
				>
					{index + 1}
				</div>
			{/snippet}

			{#snippet header()}
				<div class="flex min-w-0 items-start justify-between gap-3">
					<div class="min-w-0">
						<a
							href={resolve(`/app/storefront/${section.id}/edit`)}
							class="font-sans text-sm font-semibold wrap-break-word text-bone hover:text-volt"
						>
							{section.adminName}
						</a>
						{#if section.title}
							<p class="mt-1 truncate text-xs text-ash/70">{section.title}</p>
						{/if}
					</div>
					<AdminBadge variant={statusTone(section.visibilityStatus)} size="xs">
						{section.visibilityStatus}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<div class="mt-4 flex flex-wrap gap-1.5">
					<AdminBadge variant="accent" size="xs">{section.type.replaceAll('_', ' ')}</AdminBadge>
					<AdminBadge size="xs">{section.layoutVariant.replaceAll('_', ' ')}</AdminBadge>
				</div>
				<AdminMetaGrid cols={2}>
					<span class="text-bone">{section.sourceType.replaceAll('_', ' ')}</span>
					<span class="text-ash">{scheduleLabel(section)}</span>
					<span class="text-ash">{section.media.length} media assets</span>
					<span class="text-ash">Up to {section.itemLimit} items</span>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<AdminRowActions cols={2} ariaLabel={`Reorder ${section.adminName}`}>
					<form method="POST" action="?/reorder" use:reorderEnhance>
						<input type="hidden" name="pageKey" value="home" />
						{#each movedIds(index, -1) as id (id)}
							<input type="hidden" name="sectionIds" value={id} />
						{/each}
						<AdminIconAction
							type="submit"
							disabled={index === 0 || $reorderSubmitting}
							variant="neutral"
							ariaLabel={`Move ${section.adminName} up`}
							title="Move up"
						>
							<ArrowUp size={15} aria-hidden="true" />
						</AdminIconAction>
					</form>
					<form method="POST" action="?/reorder" use:reorderEnhance>
						<input type="hidden" name="pageKey" value="home" />
						{#each movedIds(index, 1) as id (id)}
							<input type="hidden" name="sectionIds" value={id} />
						{/each}
						<AdminIconAction
							type="submit"
							disabled={index === data.sections.length - 1 || $reorderSubmitting}
							variant="neutral"
							ariaLabel={`Move ${section.adminName} down`}
							title="Move down"
						>
							<ArrowDown size={15} aria-hidden="true" />
						</AdminIconAction>
					</form>
				</AdminRowActions>
				<AdminRowActions cols={4} ariaLabel={`Manage ${section.adminName}`}>
					<form method="POST" action="?/toggle" use:toggleEnhance>
						<input type="hidden" name="sectionId" value={section.id} />
						<input type="hidden" name="enabled" value={String(!section.enabled)} />
						<AdminIconAction
							type="submit"
							disabled={$toggleSubmitting}
							variant={section.enabled ? 'success' : 'neutral'}
							ariaLabel={`${section.enabled ? 'Disable' : 'Enable'} ${section.adminName}`}
							title={section.enabled ? 'Disable' : 'Enable'}
						>
							<Power size={15} aria-hidden="true" />
						</AdminIconAction>
					</form>
					<AdminIconAction
						href={`/app/storefront/${section.id}/edit`}
						variant="accent"
						ariaLabel={`Edit ${section.adminName}`}
						title="Edit"
					>
						<Pencil size={15} aria-hidden="true" />
					</AdminIconAction>
					<AdminIconAction
						href={homepageHref(section.id)}
						variant="neutral"
						ariaLabel={`Preview ${section.adminName} on homepage`}
						title="Preview"
					>
						<Eye size={15} aria-hidden="true" />
					</AdminIconAction>
					<form method="POST" action="?/delete" use:deleteEnhance>
						<input type="hidden" name="sectionId" value={section.id} />
						<AdminIconAction
							type="button"
							disabled={$deleteSubmitting}
							variant="danger"
							onclick={(event) => requestDelete(section, event)}
							ariaLabel={`Delete ${section.adminName}`}
							title="Delete"
						>
							<Trash2 size={15} aria-hidden="true" />
						</AdminIconAction>
					</form>
				</AdminRowActions>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet row(section: StorefrontSection)}
		{@const index = data.sections.findIndex((item) => item.id === section.id)}
		<tr class="border-b border-charcoal/70 last:border-b-0">
			<td class="px-5 py-4">
				<div class="grid h-10 w-10 place-items-center bg-charcoal font-display text-2xl text-volt">
					{index + 1}
				</div>
			</td>
			<td class="px-5 py-4">
				<div class="flex min-w-0 items-center gap-3">
					<LayoutTemplate size={18} class="shrink-0 text-volt" aria-hidden="true" />
					<div class="min-w-0">
						<a
							href={resolve(`/app/storefront/${section.id}/edit`)}
							class="font-sans text-sm font-semibold text-bone hover:text-volt"
						>
							{section.adminName}
						</a>
						<p class="mt-1 max-w-60 truncate text-xs text-ash/70">
							{section.title ?? section.type.replaceAll('_', ' ')}
						</p>
					</div>
				</div>
			</td>
			<td class="px-5 py-4">
				<p class="font-mono text-[10px] text-bone uppercase">
					{section.sourceType.replaceAll('_', ' ')}
				</p>
				<p class="mt-1 font-mono text-[9px] text-ash uppercase">
					{section.layoutVariant.replaceAll('_', ' ')}
				</p>
			</td>
			<td class="px-5 py-4">
				<AdminBadge variant={statusTone(section.visibilityStatus)} size="sm">
					{section.visibilityStatus}
				</AdminBadge>
				<p class="mt-1 max-w-48 font-mono text-[9px] text-ash uppercase">
					{scheduleLabel(section)}
				</p>
			</td>
			<td class="px-5 py-4">
				<div class="ml-auto flex w-64 items-center gap-3">
					<div class="w-20">
						<AdminRowActions cols={2} ariaLabel={`Reorder ${section.adminName}`}>
							<form method="POST" action="?/reorder" use:reorderEnhance>
								<input type="hidden" name="pageKey" value="home" />
								{#each movedIds(index, -1) as id (id)}
									<input type="hidden" name="sectionIds" value={id} />
								{/each}
								<AdminIconAction
									type="submit"
									disabled={index === 0 || $reorderSubmitting}
									variant="neutral"
									ariaLabel={`Move ${section.adminName} up`}
									title="Move up"
								>
									<ArrowUp size={14} aria-hidden="true" />
								</AdminIconAction>
							</form>
							<form method="POST" action="?/reorder" use:reorderEnhance>
								<input type="hidden" name="pageKey" value="home" />
								{#each movedIds(index, 1) as id (id)}
									<input type="hidden" name="sectionIds" value={id} />
								{/each}
								<AdminIconAction
									type="submit"
									disabled={index === data.sections.length - 1 || $reorderSubmitting}
									variant="neutral"
									ariaLabel={`Move ${section.adminName} down`}
									title="Move down"
								>
									<ArrowDown size={14} aria-hidden="true" />
								</AdminIconAction>
							</form>
						</AdminRowActions>
					</div>
					<div class="h-9 w-px bg-charcoal" aria-hidden="true"></div>
					<div class="w-40">
						<AdminRowActions cols={4} ariaLabel={`Manage ${section.adminName}`}>
							<form method="POST" action="?/toggle" use:toggleEnhance>
								<input type="hidden" name="sectionId" value={section.id} />
								<input type="hidden" name="enabled" value={String(!section.enabled)} />
								<AdminIconAction
									type="submit"
									disabled={$toggleSubmitting}
									variant={section.enabled ? 'success' : 'neutral'}
									ariaLabel={`${section.enabled ? 'Disable' : 'Enable'} ${section.adminName}`}
									title={section.enabled ? 'Disable' : 'Enable'}
								>
									<Power size={14} aria-hidden="true" />
								</AdminIconAction>
							</form>
							<AdminIconAction
								href={`/app/storefront/${section.id}/edit`}
								variant="accent"
								ariaLabel={`Edit ${section.adminName}`}
								title="Edit"
							>
								<Pencil size={14} aria-hidden="true" />
							</AdminIconAction>
							<AdminIconAction
								href={homepageHref(section.id)}
								variant="neutral"
								ariaLabel={`Preview ${section.adminName} on homepage`}
								title="Preview"
							>
								<Eye size={14} aria-hidden="true" />
							</AdminIconAction>
							<form method="POST" action="?/delete" use:deleteEnhance>
								<input type="hidden" name="sectionId" value={section.id} />
								<AdminIconAction
									type="button"
									disabled={$deleteSubmitting}
									variant="danger"
									onclick={(event) => requestDelete(section, event)}
									ariaLabel={`Delete ${section.adminName}`}
									title="Delete"
								>
									<Trash2 size={14} aria-hidden="true" />
								</AdminIconAction>
							</form>
						</AdminRowActions>
					</div>
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState
			title="No homepage sections"
			description="Create the first bounded storefront section."
		>
			{#snippet actions()}
				<AdminButton href={resolve('/app/storefront/new')} variant="volt" size="md">
					Create section
				</AdminButton>
			{/snippet}
		</AdminEmptyState>
	{/snippet}
</AdminListLayout>

<AdminConfirmDialog
	bind:open={deleteDialogOpen}
	title="Delete storefront section"
	message={`Delete ${deleteCandidate?.adminName ?? 'this section'}? Its uploaded section media will also be removed.`}
	confirmLabel="Delete section"
	loading={$deleteSubmitting}
	onconfirm={confirmDelete}
/>
