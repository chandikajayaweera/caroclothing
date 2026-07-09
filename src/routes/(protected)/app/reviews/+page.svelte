<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms';
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
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

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
	const { enhance: deleteEnhance, message: deleteMessage } = superForm(
		initialForm(() => data.deleteReviewForm)
	);
	const { enhance: addMediaEnhance, message: addMediaMessage } = superForm(
		initialForm(() => data.addReviewMediaForm)
	);
	const { enhance: deleteMediaEnhance, message: deleteMediaMessage } = superForm(
		initialForm(() => data.deleteReviewMediaForm)
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
	let openNotes = $state(new Set<string>());

	$effect(() => {
		if (actionMessage) {
			toastMessage = actionMessage;
		}
	});

	function toggleNote(id: string) {
		const next = new Set(openNotes);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		openNotes = next;
	}

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function getFilterUrl(key: string, value: string): string {
		const url = new URL(page.url);
		if (value) {
			url.searchParams.set(key, value);
		} else {
			url.searchParams.delete(key);
		}
		url.searchParams.delete('offset'); // Reset to page 1 on filter change
		return url.pathname + url.search;
	}

	function clearFilters() {
		goto('/app/reviews');
	}

	function getReorderedIds(media: any[], index: number, direction: 'left' | 'right'): string[] {
		const copy = [...media];
		const swapIndex = direction === 'left' ? index - 1 : index + 1;
		const temp = copy[index];
		copy[index] = copy[swapIndex];
		copy[swapIndex] = temp;
		return copy.map((m) => m.id);
	}

	// Layout state variables
	let showFilters = $state(false);
	const hasActiveFilters = $derived(
		data.filters.productId !== '' ||
			data.filters.userId !== '' ||
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
		`Customers · Avg ${data.summary.averageRating ?? 'N/A'}★ · ${data.summary.verifiedCount} Verified`
	);

	const stats = $derived({
		total: data.summary.totalCount,
		active: data.summary.approvedCount,
		inactive: data.summary.pendingCount
	});
</script>

<AdminToast message={toastMessage} onclose={() => (toastMessage = null)} />

<AdminListLayout
	title="Reviews"
	{kicker}
	loading={false}
	{stats}
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
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
		</div>
	{/snippet}

	{#snippet row(review: any)}
		<tr class="border-b border-charcoal/50 text-sm transition-colors hover:bg-charcoal/10">
			<!-- Rating & Review -->
			<td class="max-w-sm px-5 py-4">
				<div class="flex items-center gap-1 font-mono text-[11px] text-volt">
					{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
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
								href="/app/products/{review.product.slug}"
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
					class="mt-0.5 max-w-[120px] truncate font-mono text-[9px] text-ash/60"
					title={review.userId}
				>
					ID: {review.userId}
				</div>
				<div class="mt-1 font-mono text-[9px] text-ash/50">{formatDate(review.createdAt)}</div>
			</td>

			<!-- Verified -->
			<td class="px-5 py-4">
				{#if review.isVerifiedPurchase}
					<span
						class="inline-flex items-center gap-1 border border-volt/30 bg-volt/10 px-2 py-0.5 font-mono text-[9px] tracking-widest text-volt uppercase"
					>
						<ShieldCheck size={10} />
						Verified
					</span>
				{:else}
					<span class="font-mono text-[9px] text-ash/40 uppercase">No</span>
				{/if}
			</td>

			<!-- Status -->
			<td class="px-5 py-4">
				<span
					class="font-mono text-[10px] tracking-widest uppercase {review.isApproved
						? 'text-volt'
						: 'text-yellow-300'}"
				>
					{review.isApproved ? 'Approved' : 'Pending'}
				</span>
			</td>

			<!-- Media Grid -->
			<td class="px-5 py-4">
				<div class="flex flex-wrap gap-2">
					{#each review.media as media, i (media.id)}
						<div class="group relative border border-charcoal bg-void">
							{#if media.type === 'image'}
								<img src={media.mediaUrl} alt="" class="h-10 w-10 object-cover" />
							{:else}
								<video src={media.mediaUrl} muted class="h-10 w-10 object-cover"></video>
							{/if}

							<!-- Media Controls Overlays -->
							<div
								class="absolute inset-0 flex items-center justify-center gap-0.5 bg-void/80 opacity-0 transition-opacity group-hover:opacity-100"
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
										{#each getReorderedIds(review.media, i, 'left') as id}
											<input type="hidden" name="mediaIdsInOrder" value={id} />
										{/each}
										<button type="submit" class="p-0.5 text-ash hover:text-volt" title="Move left">
											<ChevronLeft size={12} />
										</button>
									</form>
								{/if}

								<!-- Delete -->
								<form method="POST" action="?/deleteMedia" use:deleteMediaEnhance class="inline">
									<input type="hidden" name="mediaId" value={media.id} />
									<button type="submit" class="p-0.5 text-ash hover:text-red-400" title="Delete">
										<Trash2 size={12} />
									</button>
								</form>

								<!-- Reorder Right -->
								{#if i < review.media.length - 1}
									<form
										method="POST"
										action="?/reorderMedia"
										use:reorderMediaEnhance
										class="inline"
									>
										<input type="hidden" name="reviewId" value={review.id} />
										{#each getReorderedIds(review.media, i, 'right') as id}
											<input type="hidden" name="mediaIdsInOrder" value={id} />
										{/each}
										<button type="submit" class="p-0.5 text-ash hover:text-volt" title="Move right">
											<ChevronRight size={12} />
										</button>
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
								class="flex h-10 w-10 cursor-pointer items-center justify-center border border-dashed border-charcoal bg-void transition-colors hover:border-ash/50"
							>
								<Plus size={14} class="text-ash/60 hover:text-volt" />
								<input
									name="files"
									type="file"
									multiple
									accept="image/*,video/*"
									class="hidden"
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
				<div class="flex items-center justify-end gap-2">
					<!-- Toggle Approval -->
					<form method="POST" action="?/moderate" use:moderateEnhance class="inline">
						<input type="hidden" name="reviewId" value={review.id} />
						<input type="hidden" name="isApproved" value={(!review.isApproved).toString()} />
						{#if review.adminNote}
							<input type="hidden" name="adminNote" value={review.adminNote} />
						{/if}
						<button
							type="submit"
							class="border px-2.5 py-1.5 font-mono text-[9px] tracking-widest uppercase transition-colors {review.isApproved
								? 'border-amber-400/40 text-amber-300 hover:border-amber-300'
								: 'border-volt/40 bg-volt/10 text-volt hover:border-volt'}"
						>
							{review.isApproved ? 'Reject' : 'Approve'}
						</button>
					</form>

					<!-- Admin Note Toggle -->
					<button
						type="button"
						onclick={() => toggleNote(review.id)}
						class="border px-2.5 py-1.5 font-mono text-[9px] tracking-widest uppercase transition-colors {openNotes.has(
							review.id
						) || review.adminNote
							? 'border-volt/50 bg-volt/5 text-volt'
							: 'border-charcoal text-ash hover:border-ash'}"
						title="View/Edit Admin Note"
					>
						<MessageSquare size={12} class="mr-1 inline" />
						Note
					</button>

					<!-- Delete Review -->
					<form method="POST" action="?/deleteReview" use:deleteEnhance class="inline">
						<input type="hidden" name="reviewId" value={review.id} />
						<button
							type="submit"
							onclick={(e) => {
								if (!confirm('Are you sure you want to delete this review?')) {
									e.preventDefault();
								}
							}}
							class="border border-red-500/20 px-2.5 py-1.5 font-mono text-[9px] tracking-widest text-red-400/80 uppercase transition-colors hover:border-red-400 hover:text-red-300"
						>
							Delete
						</button>
					</form>
				</div>

				<!-- Expanded Admin Note Form Drawer -->
				{#if openNotes.has(review.id)}
					<div
						class="mt-3 border border-charcoal bg-void p-3 text-left"
						transition:slide={{ duration: 150 }}
					>
						<form method="POST" action="?/moderate" use:moderateEnhance class="flex flex-col gap-2">
							<input type="hidden" name="reviewId" value={review.id} />
							<input type="hidden" name="isApproved" value={review.isApproved.toString()} />
							<label
								for="adminNote-row-{review.id}"
								class="block font-mono text-[9px] tracking-widest text-ash uppercase"
							>
								Admin Note
							</label>
							<textarea
								id="adminNote-row-{review.id}"
								name="adminNote"
								placeholder="Write moderation notes..."
								rows="2"
								class="w-full border border-charcoal bg-charcoal/20 p-2 font-mono text-xs text-bone outline-none focus:border-volt"
								>{review.adminNote ?? ''}</textarea
							>
							<div class="flex justify-end">
								<button
									type="submit"
									class="bg-bone px-3 py-1.5 font-mono text-[9px] tracking-widest text-void uppercase transition-colors hover:bg-volt"
								>
									Save Note
								</button>
							</div>
						</form>
					</div>
				{/if}
			</td>
		</tr>
	{/snippet}

	{#snippet card(review: any)}
		<article class="flex flex-col gap-4 border border-charcoal bg-void p-4">
			<!-- Header (Rating, status, verified) -->
			<div class="flex items-start justify-between gap-2">
				<div>
					<div class="flex items-center gap-1 font-mono text-xs text-volt">
						{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
					</div>
					<div class="mt-1 flex items-center gap-2">
						<span
							class="font-mono text-[9px] tracking-widest uppercase {review.isApproved
								? 'text-volt'
								: 'text-yellow-300'}"
						>
							{review.isApproved ? 'Approved' : 'Pending'}
						</span>
						{#if review.isVerifiedPurchase}
							<span
								class="inline-flex items-center gap-0.5 border border-volt/30 bg-volt/10 px-1 py-0.5 font-mono text-[8px] tracking-widest text-volt uppercase"
							>
								Verified
							</span>
						{/if}
					</div>
				</div>
				<div class="text-right">
					<span class="font-mono text-[10px] text-ash">{formatDate(review.createdAt)}</span>
				</div>
			</div>

			<!-- Product info -->
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
							href="/app/products/{review.product.slug}"
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
			<div class="flex flex-wrap gap-2">
				{#each review.media as media, i (media.id)}
					<div class="group relative border border-charcoal bg-void">
						{#if media.type === 'image'}
							<img src={media.mediaUrl} alt="" class="h-12 w-12 object-cover" />
						{:else}
							<video src={media.mediaUrl} muted class="h-12 w-12 object-cover"></video>
						{/if}

						<div
							class="absolute inset-0 flex items-center justify-center gap-1 bg-void/80 opacity-0 transition-opacity hover:opacity-100"
						>
							{#if i > 0}
								<form method="POST" action="?/reorderMedia" use:reorderMediaEnhance class="inline">
									<input type="hidden" name="reviewId" value={review.id} />
									{#each getReorderedIds(review.media, i, 'left') as id}
										<input type="hidden" name="mediaIdsInOrder" value={id} />
									{/each}
									<button type="submit" class="text-ash hover:text-volt" title="Move left">
										<ChevronLeft size={14} />
									</button>
								</form>
							{/if}

							<form method="POST" action="?/deleteMedia" use:deleteMediaEnhance class="inline">
								<input type="hidden" name="mediaId" value={media.id} />
								<button type="submit" class="text-ash hover:text-red-400" title="Delete">
									<Trash2 size={14} />
								</button>
							</form>

							{#if i < review.media.length - 1}
								<form method="POST" action="?/reorderMedia" use:reorderMediaEnhance class="inline">
									<input type="hidden" name="reviewId" value={review.id} />
									{#each getReorderedIds(review.media, i, 'right') as id}
										<input type="hidden" name="mediaIdsInOrder" value={id} />
									{/each}
									<button type="submit" class="text-ash hover:text-volt" title="Move right">
										<ChevronRight size={14} />
									</button>
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
							class="flex h-12 w-12 cursor-pointer items-center justify-center border border-dashed border-charcoal bg-void transition-colors hover:border-ash/50"
						>
							<Plus size={16} class="text-ash/60 hover:text-volt" />
							<input
								name="files"
								type="file"
								multiple
								accept="image/*,video/*"
								class="hidden"
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

			<!-- Actions -->
			<div class="flex flex-col gap-2 border-t border-charcoal/50 pt-2">
				<div class="flex items-center gap-2">
					<form method="POST" action="?/moderate" use:moderateEnhance class="flex-1">
						<input type="hidden" name="reviewId" value={review.id} />
						<input type="hidden" name="isApproved" value={(!review.isApproved).toString()} />
						{#if review.adminNote}
							<input type="hidden" name="adminNote" value={review.adminNote} />
						{/if}
						<button
							type="submit"
							class="w-full border py-2 font-mono text-[10px] tracking-widest uppercase transition-colors {review.isApproved
								? 'border-amber-400/40 text-amber-300 hover:border-amber-300'
								: 'border-volt/40 bg-volt/10 text-volt hover:border-volt'}"
						>
							{review.isApproved ? 'Reject / Move to Pending' : 'Approve Review'}
						</button>
					</form>

					<button
						type="button"
						onclick={() => toggleNote(review.id)}
						class="border px-3 py-2 font-mono text-[10px] tracking-widest uppercase transition-colors {openNotes.has(
							review.id
						) || review.adminNote
							? 'border-volt/50 bg-volt/5 text-volt'
							: 'border-charcoal text-ash hover:border-ash'}"
					>
						<MessageSquare size={14} class="mr-1 inline" />
						Note
					</button>

					<form method="POST" action="?/deleteReview" use:deleteEnhance class="inline">
						<input type="hidden" name="reviewId" value={review.id} />
						<button
							type="submit"
							onclick={(e) => {
								if (!confirm('Are you sure you want to delete this review?')) {
									e.preventDefault();
								}
							}}
							class="border border-red-500/20 px-3 py-2 font-mono text-[10px] tracking-widest text-red-400/80 uppercase transition-colors hover:border-red-400 hover:text-red-300"
						>
							<Trash2 size={14} />
						</button>
					</form>
				</div>

				{#if openNotes.has(review.id)}
					<div class="mt-1 border border-charcoal bg-void p-3" transition:slide={{ duration: 150 }}>
						<form method="POST" action="?/moderate" use:moderateEnhance class="flex flex-col gap-2">
							<input type="hidden" name="reviewId" value={review.id} />
							<input type="hidden" name="isApproved" value={review.isApproved.toString()} />
							<label
								for="adminNote-card-{review.id}"
								class="block font-mono text-[9px] tracking-widest text-ash uppercase"
							>
								Admin Note
							</label>
							<textarea
								id="adminNote-card-{review.id}"
								name="adminNote"
								placeholder="Write moderation notes..."
								rows="2"
								class="w-full border border-charcoal bg-charcoal/20 p-2 font-mono text-xs text-bone outline-none focus:border-volt"
								>{review.adminNote ?? ''}</textarea
							>
							<div class="flex justify-end">
								<button
									type="submit"
									class="bg-bone px-3 py-1.5 font-mono text-[9px] tracking-widest text-void uppercase transition-colors hover:bg-volt"
								>
									Save Note
								</button>
							</div>
						</form>
					</div>
				{/if}
			</div>
		</article>
	{/snippet}
</AdminListLayout>
