<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { superForm } from 'sveltekit-superforms';
	import { SvelteSet } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';
	import type { ActionData, PageData } from './$types';
	import {
		Trash2,
		MessageSquare,
		ShieldCheck,
		ChevronLeft,
		ChevronRight,
		Plus,
		ImageOff
	} from 'lucide-svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminToast from '$lib/components/admin/feedback/AdminToast.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminConfirmDialog from '$lib/components/admin/overlays/AdminConfirmDialog.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminIconAction from '$lib/components/admin/data-display/AdminIconAction.svelte';
	import AdminRowActions from '$lib/components/admin/data-display/AdminRowActions.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import { formatAdminDateTime } from '$lib/shared/admin/format';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	type ReviewItem = PageData['reviews']['items'][number];
	let pendingReviewDelete = $state<ReviewItem | null>(null);
	let pendingMediaDelete = $state<{ id: string; reviewId: string } | null>(null);
	let reviewDeleteConfirmOpen = $state(false);
	let mediaDeleteConfirmOpen = $state(false);
	let reviewDeleteFormElement = $state<HTMLFormElement | null>(null);
	let mediaDeleteFormElement = $state<HTMLFormElement | null>(null);

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	// Initialize superforms for inline operations
	const { enhance: moderateEnhance, message: moderateMessage } = superForm(
		initialForm(() => data.moderateReviewForm),
		{
			resetForm: false
		}
	);
	const {
		enhance: deleteEnhance,
		message: deleteMessage,
		submitting: deleteSubmitting
	} = superForm(
		initialForm(() => data.deleteReviewForm),
		{
			onUpdated({ form }) {
				if (form.valid) {
					pendingReviewDelete = null;
					reviewDeleteConfirmOpen = false;
				}
			}
		}
	);
	const { enhance: addMediaEnhance, message: addMediaMessage } = superForm(
		initialForm(() => data.addReviewMediaForm)
	);
	const {
		enhance: deleteMediaEnhance,
		message: deleteMediaMessage,
		submitting: deleteMediaSubmitting
	} = superForm(
		initialForm(() => data.deleteReviewMediaForm),
		{
			onUpdated({ form }) {
				if (form.valid) {
					pendingMediaDelete = null;
					mediaDeleteConfirmOpen = false;
				}
			}
		}
	);
	const { enhance: reorderMediaEnhance, message: reorderMediaMessage } = superForm(
		initialForm(() => data.reorderReviewMediaForm)
	);

	// Action feedback toast message mapping
	const actionMessage = $derived(
		actionData?.form?.message ??
			$moderateMessage ??
			$deleteMessage ??
			$addMediaMessage ??
			$deleteMediaMessage ??
			$reorderMediaMessage
	);

	let toastMessage = $state<string | null>(null);
	const openNotes = new SvelteSet<string>();

	$effect(() => {
		if (actionMessage) {
			toastMessage = actionMessage;
		}
	});

	function toggleNote(id: string) {
		if (openNotes.has(id)) {
			openNotes.delete(id);
		} else {
			openNotes.add(id);
		}
	}

	function clearFilters() {
		goto(resolve('/app/reviews'));
	}

	function getReorderedIds(
		media: ReviewItem['media'],
		index: number,
		direction: 'left' | 'right'
	): string[] {
		const copy = [...media];
		const swapIndex = direction === 'left' ? index - 1 : index + 1;
		const temp = copy[index];
		copy[index] = copy[swapIndex];
		copy[swapIndex] = temp;
		return copy.map((m) => m.id);
	}

	function requestReviewDelete(review: ReviewItem) {
		pendingReviewDelete = review;
		reviewDeleteConfirmOpen = true;
	}

	function requestMediaDelete(mediaId: string, reviewId: string) {
		pendingMediaDelete = { id: mediaId, reviewId };
		mediaDeleteConfirmOpen = true;
	}

	function confirmReviewDelete() {
		reviewDeleteFormElement?.requestSubmit();
	}

	function confirmMediaDelete() {
		mediaDeleteFormElement?.requestSubmit();
	}

	// Layout state variables
	let showFilters = $state(false);
	const hasActiveFilters = $derived(
		data.filters.status !== '' ||
			data.filters.productId !== '' ||
			data.filters.userId !== '' ||
			data.filters.orderId !== '' ||
			data.filters.verified !== '' ||
			data.filters.rating !== ''
	);

	// Headers for table view
	const tableHeaders = [
		{ label: 'Rating & Review' },
		{ label: 'Product' },
		{ label: 'Customer' },
		{ label: 'Verified' },
		{ label: 'Status' },
		{ label: 'Media' },
		{ label: 'Actions', class: 'text-right' }
	];

	// Derive stats and metadata
	const kicker = $derived(
		`Customers / Avg ${data.summary.averageRating ?? 'N/A'} of 5 / ${data.summary.verifiedCount} Verified`
	);

	const stats = $derived({
		total: data.summary.totalCount,
		active: data.summary.approvedCount,
		inactive: data.summary.pendingCount
	});
</script>

<AdminToast
	message={toastMessage}
	type={page.status >= 400 ? 'error' : 'success'}
	onclose={() => (toastMessage = null)}
/>

<AdminListLayout
	title="Reviews"
	{kicker}
	loading={false}
	metrics={[
		{ label: 'Total Reviews', value: stats.total },
		{ label: 'Approved', value: stats.active, tone: 'success' },
		{ label: 'Pending Moderation', value: stats.inactive, tone: 'warning' },
		{ label: 'Verified Purchases', value: data.summary.verifiedCount, tone: 'info' }
	]}
	bind:showFilters
	{hasActiveFilters}
	query={data.filters.query}
	searchPlaceholder="Search review title or body..."
	totalItems={data.reviews.total}
	limit={data.filters.limit}
	offset={data.filters.offset}
	{tableHeaders}
	items={data.reviews.items}
	onclearfilters={clearFilters}
>
	{#snippet advancedFilters()}
		<AdminFilterBar cols={4}>
			<AdminSelect
				label="Status"
				name="status"
				value={data.filters.status}
				options={[
					{ value: '', label: 'All Statuses' },
					{ value: 'pending', label: 'Pending' },
					{ value: 'approved', label: 'Approved' }
				]}
				onchange={(e) => {
					const form = (e.currentTarget as HTMLElement).closest('form');
					if (form) form.requestSubmit();
				}}
			/>
			<AdminInput
				label="Product ID"
				name="productId"
				value={data.filters.productId}
				placeholder="Filter by product ID"
			/>
			<AdminInput
				label="User ID"
				name="userId"
				value={data.filters.userId}
				placeholder="Filter by user ID"
			/>
			<AdminInput
				label="Order ID"
				name="orderId"
				value={data.filters.orderId}
				placeholder="Filter by order ID"
			/>
			<AdminSelect
				label="Verified Purchase"
				name="verified"
				value={data.filters.verified}
				options={[
					{ value: '', label: 'Any verification' },
					{ value: 'verified', label: 'Verified Only' },
					{ value: 'unverified', label: 'Unverified Only' }
				]}
			/>
			<AdminSelect
				label="Rating"
				name="rating"
				value={data.filters.rating}
				options={[
					{ value: '', label: 'Any rating' },
					{ value: '5', label: '5 Stars' },
					{ value: '4', label: '4 Stars' },
					{ value: '3', label: '3 Stars' },
					{ value: '2', label: '2 Stars' },
					{ value: '1', label: '1 Star' }
				]}
			/>
		</AdminFilterBar>
	{/snippet}

	{#snippet row(review: ReviewItem)}
		<tr class="border-b border-charcoal/50 text-sm transition-colors hover:bg-charcoal/10">
			<!-- Rating & Review -->
			<td class="max-w-sm px-5 py-4">
				<div class="flex items-center gap-1 font-mono text-[11px] text-volt">
					{review.rating} / 5
				</div>
				{#if review.title}
					<p class="mt-1 font-display text-base text-bone uppercase">{review.title}</p>
				{/if}
				{#if review.body}
					<p class="mt-1 line-clamp-3 text-xs leading-relaxed text-ash">{review.body}</p>
				{/if}
				{#if review.adminNote}
					<div class="mt-2 border-l border-volt bg-volt/5 py-1 pl-2 text-[11px] text-ash/80">
						<span class="block font-mono text-[9px] tracking-wider text-volt uppercase"
							>Admin Note:</span
						>
						{review.adminNote}
					</div>
				{/if}
			</td>

			<!-- Product -->
			<td class="px-5 py-4">
				<div class="flex items-center gap-3">
					{#if review.product?.primaryImageUrl}
						<img
							src={review.product.primaryImageUrl}
							alt=""
							class="h-10 w-10 border border-charcoal object-cover"
						/>
					{:else}
						<div class="flex h-10 w-10 items-center justify-center border border-charcoal bg-void">
							<ImageOff size={14} class="text-ash/40" />
						</div>
					{/if}
					<div class="min-w-0">
						{#if review.product}
							<a
								href={resolve(`/app/products/${review.product.slug}`)}
								class="block truncate font-mono text-xs tracking-wider text-bone hover:text-volt"
							>
								{review.product.name}
							</a>
						{:else}
							<span class="font-mono text-xs text-ash/60">{review.productId}</span>
						{/if}
					</div>
				</div>
			</td>

			<!-- Customer -->
			<td class="px-5 py-4">
				<div class="font-sans text-xs text-bone">{review.reviewerName}</div>
				<div
					class="mt-0.5 max-w-30 truncate font-mono text-[9px] text-ash/60"
					title={review.userId}
				>
					ID: {review.userId}
				</div>
				<div class="mt-1 font-mono text-[9px] text-ash/50">
					{formatAdminDateTime(review.createdAt, '—')}
				</div>
			</td>

			<!-- Verified -->
			<td class="px-5 py-4">
				{#if review.isVerifiedPurchase}
					<AdminBadge variant="success" class="gap-1">
						<ShieldCheck size={10} />
						Verified
					</AdminBadge>
				{:else}
					<AdminBadge variant="neutral">Not verified</AdminBadge>
				{/if}
			</td>

			<!-- Status -->
			<td class="px-5 py-4">
				<AdminBadge variant={review.isApproved ? 'success' : 'warning'}>
					{review.isApproved ? 'Approved' : 'Pending'}
				</AdminBadge>
			</td>

			<!-- Media Grid -->
			<td class="px-5 py-4">
				<div class="flex max-w-80 gap-2 overflow-x-auto pb-1">
					{#each review.media as media, i (media.id)}
						<div class="relative h-36 w-36 shrink-0 overflow-hidden border border-charcoal bg-void">
							<AdminButton
								type="button"
								variant="outline"
								class="block h-auto p-0"
								onclick={() => window.open(media.mediaUrl, '_blank', 'noopener,noreferrer')}
								aria-label="Open review media"
							>
								<img src={media.mediaUrl} alt="" loading="lazy" class="h-36 w-36 object-cover" />
							</AdminButton>

							<!-- Media Controls Overlays -->
							<div
								class="absolute inset-x-0 bottom-0 grid min-h-11 grid-cols-3 gap-1 bg-void/90 p-1"
							>
								<!-- Reorder Left -->
								{#if i > 0}
									<form
										method="POST"
										action="?/reorderMedia"
										use:reorderMediaEnhance
										class="inline"
									>
										<input type="hidden" name="reviewId" value={review.id} />
										{#each getReorderedIds(review.media, i, 'left') as id (id)}
											<input type="hidden" name="mediaIdsInOrder" value={id} />
										{/each}
										<AdminIconAction
											type="submit"
											variant="info"
											title="Move left"
											ariaLabel="Move media left"
										>
											<ChevronLeft size={12} />
										</AdminIconAction>
									</form>
								{/if}

								<!-- Delete -->
								<AdminIconAction
									onclick={() => requestMediaDelete(media.id, review.id)}
									variant="danger"
									title="Delete media"
									ariaLabel="Delete review media"
								>
									<Trash2 size={12} />
								</AdminIconAction>

								<!-- Reorder Right -->
								{#if i < review.media.length - 1}
									<form
										method="POST"
										action="?/reorderMedia"
										use:reorderMediaEnhance
										class="inline"
									>
										<input type="hidden" name="reviewId" value={review.id} />
										{#each getReorderedIds(review.media, i, 'right') as id (id)}
											<input type="hidden" name="mediaIdsInOrder" value={id} />
										{/each}
										<AdminIconAction
											type="submit"
											variant="info"
											title="Move right"
											ariaLabel="Move media right"
										>
											<ChevronRight size={12} />
										</AdminIconAction>
									</form>
								{/if}
							</div>
						</div>
					{/each}

					<!-- Add Inline Media Button -->
					{#if review.media.length < 5}
						<form
							method="POST"
							action="?/addMedia"
							enctype="multipart/form-data"
							use:addMediaEnhance
							class="inline"
						>
							<input type="hidden" name="reviewId" value={review.id} />
							<label
								class="flex h-36 w-36 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-charcoal bg-void text-center transition-colors hover:border-volt"
								aria-label="Add review media"
							>
								<Plus size={14} class="text-ash/60 hover:text-volt" />
								<span class="font-mono text-[9px] tracking-wider text-ash uppercase">Add media</span
								>
								<input
									name="files"
									type="file"
									multiple
									accept="image/jpeg,image/png,image/webp,image/avif"
									class="sr-only"
									onchange={(e) => {
										const form = e.currentTarget.closest('form');
										if (form) form.requestSubmit();
									}}
								/>
							</label>
						</form>
					{/if}
				</div>
			</td>

			<!-- Actions -->
			<td class="px-5 py-4 text-right">
				<AdminRowActions cols={3} ariaLabel={`Actions for review ${review.id}`}>
					<!-- Toggle Approval -->
					<form method="POST" action="?/moderate" use:moderateEnhance class="inline">
						<input type="hidden" name="reviewId" value={review.id} />
						<input type="hidden" name="isApproved" value={(!review.isApproved).toString()} />
						{#if review.adminNote}
							<input type="hidden" name="adminNote" value={review.adminNote} />
						{/if}
						<AdminButton type="submit" size="sm" variant={review.isApproved ? 'outline' : 'volt'}>
							{review.isApproved ? 'Reject' : 'Approve'}
						</AdminButton>
					</form>

					<!-- Admin Note Toggle -->
					<AdminButton
						type="button"
						onclick={() => toggleNote(review.id)}
						size="sm"
						variant={openNotes.has(review.id) || review.adminNote ? 'volt' : 'outline'}
					>
						<MessageSquare size={12} />
						Note
					</AdminButton>

					<!-- Delete Review -->
					<AdminIconAction
						onclick={() => requestReviewDelete(review)}
						variant="danger"
						title="Delete review"
						ariaLabel="Delete review"
					>
						<Trash2 size={14} />
					</AdminIconAction>
				</AdminRowActions>

				<!-- Expanded Admin Note Form Drawer -->
				{#if openNotes.has(review.id)}
					<div
						class="mt-3 border border-charcoal bg-void p-3 text-left"
						transition:slide={{ duration: 150 }}
					>
						<form method="POST" action="?/moderate" use:moderateEnhance class="flex flex-col gap-2">
							<input type="hidden" name="reviewId" value={review.id} />
							<input type="hidden" name="isApproved" value={review.isApproved.toString()} />
							<AdminTextarea
								label="Admin Note"
								id="adminNote-row-{review.id}"
								name="adminNote"
								placeholder="Write moderation notes..."
								rows={2}
								value={review.adminNote ?? ''}
							/>
							<div class="flex justify-end">
								<AdminButton type="submit" variant="volt" size="sm">Save Note</AdminButton>
							</div>
						</form>
					</div>
				{/if}
			</td>
		</tr>
	{/snippet}

	{#snippet card(review: ReviewItem)}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex items-start justify-between gap-2">
					<div>
						<div class="flex items-center gap-1 font-mono text-xs text-volt">
							{review.rating} / 5
						</div>
						<div class="mt-1 flex items-center gap-2">
							<AdminBadge variant={review.isApproved ? 'success' : 'warning'}>
								{review.isApproved ? 'Approved' : 'Pending'}
							</AdminBadge>
							{#if review.isVerifiedPurchase}
								<AdminBadge variant="success" size="xs">Verified</AdminBadge>
							{/if}
						</div>
					</div>
					<div class="text-right">
						<span class="font-mono text-[10px] text-ash">
							{formatAdminDateTime(review.createdAt, '—')}
						</span>
					</div>
				</div>
			{/snippet}

			{#snippet description()}
				<div class="flex items-center gap-3 border-t border-b border-charcoal/50 py-3">
					{#if review.product?.primaryImageUrl}
						<img
							src={review.product.primaryImageUrl}
							alt=""
							class="h-12 w-12 border border-charcoal object-cover"
						/>
					{:else}
						<div
							class="flex h-12 w-12 items-center justify-center border border-charcoal bg-charcoal/20"
						>
							<ImageOff size={16} class="text-ash/40" />
						</div>
					{/if}
					<div class="min-w-0 flex-1">
						{#if review.product}
							<a
								href={resolve(`/app/products/${review.product.slug}`)}
								class="block truncate font-mono text-xs tracking-wider text-bone uppercase hover:text-volt"
							>
								{review.product.name}
							</a>
						{:else}
							<span class="font-mono text-xs text-ash/60">{review.productId}</span>
						{/if}
					</div>
				</div>

				<!-- Review Text -->
				<div>
					{#if review.title}
						<h3 class="font-display text-lg text-bone uppercase">{review.title}</h3>
					{/if}
					{#if review.body}
						<p class="mt-1 text-xs leading-relaxed text-ash">{review.body}</p>
					{/if}

					{#if review.adminNote}
						<div class="mt-3 border-l border-volt bg-volt/5 py-1 pl-2.5 text-xs text-ash/80">
							<span class="block font-mono text-[9px] tracking-wider text-volt uppercase"
								>Admin Note:</span
							>
							{review.adminNote}
						</div>
					{/if}
				</div>

				<!-- Media Attachments -->
				<div class="flex max-w-full gap-2 overflow-x-auto pb-1">
					{#each review.media as media, i (media.id)}
						<div class="relative h-36 w-36 shrink-0 overflow-hidden border border-charcoal bg-void">
							<AdminButton
								type="button"
								variant="outline"
								class="block h-auto p-0"
								onclick={() => window.open(media.mediaUrl, '_blank', 'noopener,noreferrer')}
								aria-label="Open review media"
							>
								<img src={media.mediaUrl} alt="" loading="lazy" class="h-36 w-36 object-cover" />
							</AdminButton>

							<div
								class="absolute inset-x-0 bottom-0 grid min-h-11 grid-cols-3 gap-1 bg-void/90 p-1"
							>
								{#if i > 0}
									<form
										method="POST"
										action="?/reorderMedia"
										use:reorderMediaEnhance
										class="inline"
									>
										<input type="hidden" name="reviewId" value={review.id} />
										{#each getReorderedIds(review.media, i, 'left') as id (id)}
											<input type="hidden" name="mediaIdsInOrder" value={id} />
										{/each}
										<AdminIconAction
											type="submit"
											variant="info"
											title="Move left"
											ariaLabel="Move media left"
										>
											<ChevronLeft size={14} />
										</AdminIconAction>
									</form>
								{/if}

								<AdminIconAction
									onclick={() => requestMediaDelete(media.id, review.id)}
									variant="danger"
									title="Delete media"
									ariaLabel="Delete review media"
								>
									<Trash2 size={14} />
								</AdminIconAction>

								{#if i < review.media.length - 1}
									<form
										method="POST"
										action="?/reorderMedia"
										use:reorderMediaEnhance
										class="inline"
									>
										<input type="hidden" name="reviewId" value={review.id} />
										{#each getReorderedIds(review.media, i, 'right') as id (id)}
											<input type="hidden" name="mediaIdsInOrder" value={id} />
										{/each}
										<AdminIconAction
											type="submit"
											variant="info"
											title="Move right"
											ariaLabel="Move media right"
										>
											<ChevronRight size={14} />
										</AdminIconAction>
									</form>
								{/if}
							</div>
						</div>
					{/each}

					{#if review.media.length < 5}
						<form
							method="POST"
							action="?/addMedia"
							enctype="multipart/form-data"
							use:addMediaEnhance
							class="inline"
						>
							<input type="hidden" name="reviewId" value={review.id} />
							<label
								class="flex h-36 w-36 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-charcoal bg-void text-center transition-colors hover:border-volt"
								aria-label="Add review media"
							>
								<Plus size={16} class="text-ash/60 hover:text-volt" />
								<span class="font-mono text-[9px] tracking-wider text-ash uppercase">Add media</span
								>
								<input
									name="files"
									type="file"
									multiple
									accept="image/jpeg,image/png,image/webp,image/avif"
									class="sr-only"
									onchange={(e) => {
										const form = e.currentTarget.closest('form');
										if (form) form.requestSubmit();
									}}
								/>
							</label>
						</form>
					{/if}
				</div>

				<!-- Customer details -->
				<div class="font-mono text-[11px] text-ash/70">
					<div>By: <span class="text-bone">{review.reviewerName}</span> (ID: {review.userId})</div>
				</div>
			{/snippet}

			{#snippet actions()}
				<div class="flex flex-col gap-2 border-t border-charcoal/50 pt-2">
					<AdminRowActions cols={3} ariaLabel={`Actions for review ${review.id}`}>
						<form method="POST" action="?/moderate" use:moderateEnhance>
							<input type="hidden" name="reviewId" value={review.id} />
							<input type="hidden" name="isApproved" value={(!review.isApproved).toString()} />
							{#if review.adminNote}
								<input type="hidden" name="adminNote" value={review.adminNote} />
							{/if}
							<AdminButton
								type="submit"
								size="sm"
								variant={review.isApproved ? 'outline' : 'volt'}
								class="w-full"
							>
								{review.isApproved ? 'Reject' : 'Approve'}
							</AdminButton>
						</form>

						<AdminButton
							type="button"
							onclick={() => toggleNote(review.id)}
							size="sm"
							variant={openNotes.has(review.id) || review.adminNote ? 'volt' : 'outline'}
						>
							<MessageSquare size={14} />
							Note
						</AdminButton>

						<AdminIconAction
							onclick={() => requestReviewDelete(review)}
							variant="danger"
							title="Delete review"
							ariaLabel="Delete review"
						>
							<Trash2 size={14} />
						</AdminIconAction>
					</AdminRowActions>

					{#if openNotes.has(review.id)}
						<div
							class="mt-1 border border-charcoal bg-void p-3"
							transition:slide={{ duration: 150 }}
						>
							<form
								method="POST"
								action="?/moderate"
								use:moderateEnhance
								class="flex flex-col gap-2"
							>
								<input type="hidden" name="reviewId" value={review.id} />
								<input type="hidden" name="isApproved" value={review.isApproved.toString()} />
								<AdminTextarea
									label="Admin Note"
									id="adminNote-card-{review.id}"
									name="adminNote"
									placeholder="Write moderation notes..."
									rows={2}
									value={review.adminNote ?? ''}
								/>
								<div class="flex justify-end">
									<AdminButton type="submit" variant="volt" size="sm">Save Note</AdminButton>
								</div>
							</form>
						</div>
					{/if}
				</div>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState title="No reviews found" description="Adjust filters or query parameters." />
	{/snippet}
</AdminListLayout>

{#if pendingReviewDelete}
	<form bind:this={reviewDeleteFormElement} method="POST" action="?/deleteReview" use:deleteEnhance>
		<input type="hidden" name="reviewId" value={pendingReviewDelete.id} />
	</form>
{/if}

{#if pendingMediaDelete}
	<form
		bind:this={mediaDeleteFormElement}
		method="POST"
		action="?/deleteMedia"
		use:deleteMediaEnhance
	>
		<input type="hidden" name="mediaId" value={pendingMediaDelete.id} />
	</form>
{/if}

<AdminConfirmDialog
	bind:open={reviewDeleteConfirmOpen}
	title="Delete review"
	message="Permanently delete this review and its attached media?"
	confirmLabel="Delete review"
	loading={$deleteSubmitting}
	onconfirm={confirmReviewDelete}
/>

<AdminConfirmDialog
	bind:open={mediaDeleteConfirmOpen}
	title="Delete review media"
	message="Permanently delete this media attachment?"
	confirmLabel="Delete media"
	loading={$deleteMediaSubmitting}
	onconfirm={confirmMediaDelete}
/>
