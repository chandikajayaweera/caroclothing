<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { BadgePercent, Eye, Pause, Play, Plus } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminRowActions from '$lib/components/admin/data-display/AdminRowActions.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import { formatAdminDateTime, formatAdminDiscount } from '$lib/shared/admin/format';
	import { promotionStatusVariant } from '$lib/shared/admin/status';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	type PromotionItem = PageData['promotions']['items'][number];

	const tableHeaders = [
		{ label: 'Promotion' },
		{ label: 'Discount' },
		{ label: 'Reach' },
		{ label: 'Usage' },
		{ label: 'Lifecycle' },
		{ label: 'Actions', class: 'text-right' }
	];

	const hasActiveFilters = $derived(data.filters.mode !== '');
	let showFilters = $state(false);

	$effect(() => {
		if (hasActiveFilters) showFilters = true;
	});

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		message: activeMessage,
		enhance: activeEnhance,
		submitting: activeSubmitting
	} = superForm(
		initialForm(() => data.activeForm),
		{ resetForm: false }
	);

	const actionMessage = $derived(actionData?.form?.message ?? $activeMessage);
	const pageMetrics = $derived([
		{
			label: 'Matching rules',
			value: data.promotions.total,
			description: 'Across all result pages',
			tone: 'neutral' as const
		},
		{
			label: 'Active shown',
			value: data.promotions.items.filter((item) => item.status === 'active').length,
			description: 'On this page',
			tone: 'success' as const
		},
		{
			label: 'Code shown',
			value: data.promotions.items.filter((item) => item.applicationMode === 'code').length,
			description: 'On this page',
			tone: 'accent' as const
		},
		{
			label: 'Automatic shown',
			value: data.promotions.items.filter((item) => item.applicationMode === 'automatic').length,
			description: 'On this page',
			tone: 'info' as const
		}
	]);

	function clearFilters() {
		goto(resolve('/app/promotions'));
	}

	function scheduleLabel(promotion: PromotionItem): string {
		if (promotion.status === 'scheduled') {
			return `Starts ${formatAdminDateTime(promotion.startsAt)}`;
		}
		if (promotion.status === 'expired') {
			return `Ended ${formatAdminDateTime(promotion.expiresAt)}`;
		}
		if (promotion.expiresAt) {
			return `Ends ${formatAdminDateTime(promotion.expiresAt)}`;
		}
		return promotion.isActive ? 'No expiry' : 'Not running';
	}
</script>

{#if actionData}
	<p hidden>Form response received.</p>
{/if}

<AdminListLayout
	kicker="Commerce"
	title="Promotions"
	description="Manage discount policy, eligibility, lifecycle, and redemption channels without mixing audit history into CRUD."
	{actionMessage}
	metrics={pageMetrics}
	query={data.filters.query}
	bind:showFilters
	{hasActiveFilters}
	searchPlaceholder="Search name or public title..."
	totalItems={data.promotions.total}
	limit={data.filters.limit}
	offset={data.filters.offset}
	preserveParams={['mode']}
	{tableHeaders}
	items={data.promotions.items}
	onclearfilters={clearFilters}
>
	{#snippet headerActions()}
		<AdminButton href={resolve('/app/promotions/new')} variant="volt" size="md">
			<Plus size={14} aria-hidden="true" />
			New promotion
		</AdminButton>
	{/snippet}

	{#snippet advancedFilters()}
		<AdminFilterBar cols={1}>
			<AdminSelect
				label="Application mode"
				name="mode"
				value={data.filters.mode}
				onchange={(event) => {
					const filterForm = (event.currentTarget as HTMLElement).closest('form');
					filterForm?.requestSubmit();
				}}
			>
				<option value="">All modes</option>
				<option value="code">Code</option>
				<option value="automatic">Automatic</option>
			</AdminSelect>
		</AdminFilterBar>
	{/snippet}

	{#snippet card(promotion: PromotionItem)}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex min-w-0 items-start justify-between gap-3">
					<div class="min-w-0">
						<a
							href={resolve(`/app/promotions/${promotion.id}`)}
							class="font-sans text-sm font-semibold wrap-break-word text-bone hover:text-volt"
						>
							{promotion.name}
						</a>
						<p class="mt-1 truncate text-xs text-ash/70">
							{promotion.publicTitle ?? 'Internal promotion'}
						</p>
					</div>
					<AdminBadge variant={promotionStatusVariant(promotion.status)} size="xs">
						{promotion.status}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<div class="mt-4 flex flex-wrap gap-1.5">
					<AdminBadge variant="accent" size="xs">{promotion.applicationMode}</AdminBadge>
					<AdminBadge size="xs">{promotion.visibility}</AdminBadge>
					<AdminBadge size="xs">{promotion.eligibilityScope.replaceAll('_', ' ')}</AdminBadge>
				</div>
				<AdminMetaGrid cols={2}>
					<span class="text-bone">
						{formatAdminDiscount(promotion.discountType, promotion.discountValue)}
					</span>
					<span class="text-ash">{scheduleLabel(promotion)}</span>
					<span class="text-ash">
						{promotion.usedCount} / {promotion.usageLimit ?? 'unlimited'} used
					</span>
					<span class="text-ash">
						{promotion.codes.length}
						{promotion.codes.length === 1 ? 'code' : 'codes'}
					</span>
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<AdminRowActions cols={2} ariaLabel={`Actions for ${promotion.name}`}>
					<AdminIconAction
						href={`/app/promotions/${promotion.id}`}
						variant="accent"
						ariaLabel={`Manage ${promotion.name}`}
						title="Manage"
					>
						<Eye size={15} aria-hidden="true" />
					</AdminIconAction>
					<form method="POST" action="?/setActive" use:activeEnhance>
						<input type="hidden" name="promotionId" value={promotion.id} />
						<input type="hidden" name="isActive" value={String(!promotion.isActive)} />
						<AdminIconAction
							type="submit"
							disabled={$activeSubmitting}
							variant={promotion.isActive ? 'danger' : 'success'}
							ariaLabel={`${promotion.isActive ? 'Pause' : 'Activate'} ${promotion.name}`}
							title={promotion.isActive ? 'Pause' : 'Activate'}
						>
							{#if promotion.isActive}
								<Pause size={15} aria-hidden="true" />
							{:else}
								<Play size={15} aria-hidden="true" />
							{/if}
						</AdminIconAction>
					</form>
				</AdminRowActions>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet row(promotion: PromotionItem)}
		<tr class="border-b border-charcoal/70 last:border-b-0">
			<td class="px-5 py-4">
				<div class="flex min-w-0 items-center gap-3">
					<div class="grid h-10 w-10 shrink-0 place-items-center bg-charcoal text-volt">
						<BadgePercent size={17} aria-hidden="true" />
					</div>
					<div class="min-w-0">
						<a
							href={resolve(`/app/promotions/${promotion.id}`)}
							class="font-sans text-sm font-semibold text-bone hover:text-volt"
						>
							{promotion.name}
						</a>
						<p class="mt-1 max-w-52 truncate text-xs text-ash/70">
							{promotion.publicTitle ?? 'Internal promotion'}
						</p>
					</div>
				</div>
			</td>
			<td class="px-5 py-4 font-mono text-xs text-bone">
				{formatAdminDiscount(promotion.discountType, promotion.discountValue)}
			</td>
			<td class="px-5 py-4">
				<div class="flex flex-col items-start gap-1">
					<AdminBadge variant="accent" size="xs">{promotion.applicationMode}</AdminBadge>
					<span class="font-mono text-[10px] text-ash uppercase">{promotion.visibility}</span>
				</div>
			</td>
			<td class="px-5 py-4 font-mono text-[10px] text-ash">
				{promotion.usedCount} / {promotion.usageLimit ?? 'unlimited'}
			</td>
			<td class="px-5 py-4">
				<AdminBadge variant={promotionStatusVariant(promotion.status)} size="sm">
					{promotion.status}
				</AdminBadge>
				<p class="mt-1 max-w-48 font-mono text-[9px] text-ash uppercase">
					{scheduleLabel(promotion)}
				</p>
			</td>
			<td class="px-5 py-4">
				<div class="ml-auto w-24">
					<AdminRowActions cols={2} ariaLabel={`Actions for ${promotion.name}`}>
						<AdminIconAction
							href={`/app/promotions/${promotion.id}`}
							variant="accent"
							ariaLabel={`Manage ${promotion.name}`}
							title="Manage"
						>
							<Eye size={14} aria-hidden="true" />
						</AdminIconAction>
						<form method="POST" action="?/setActive" use:activeEnhance>
							<input type="hidden" name="promotionId" value={promotion.id} />
							<input type="hidden" name="isActive" value={String(!promotion.isActive)} />
							<AdminIconAction
								type="submit"
								disabled={$activeSubmitting}
								variant={promotion.isActive ? 'danger' : 'success'}
								ariaLabel={`${promotion.isActive ? 'Pause' : 'Activate'} ${promotion.name}`}
								title={promotion.isActive ? 'Pause' : 'Activate'}
							>
								{#if promotion.isActive}
									<Pause size={14} aria-hidden="true" />
								{:else}
									<Play size={14} aria-hidden="true" />
								{/if}
							</AdminIconAction>
						</form>
					</AdminRowActions>
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState
			title="No promotions found"
			description="Adjust filters or create a new inactive promotion."
		>
			{#snippet actions()}
				<AdminButton href={resolve('/app/promotions/new')} variant="volt" size="md">
					Create promotion
				</AdminButton>
			{/snippet}
		</AdminEmptyState>
	{/snippet}
</AdminListLayout>
