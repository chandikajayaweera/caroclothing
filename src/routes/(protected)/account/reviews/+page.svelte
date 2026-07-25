<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Dialog } from 'bits-ui';
	import {
		ChevronLeft,
		ChevronRight,
		ImagePlus,
		MessageSquare,
		Pencil,
		ShieldCheck,
		Star,
		Trash2
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	let editingId = $state<string | null>(null);
	let deleting = $state(false);
	let deleteOpen = $state(false);
	let deleteTarget = $state<
		| { type: 'review'; id: string; label: string }
		| { type: 'media'; id: string; label: string }
		| null
	>(null);

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const updateSuperform = superForm(
		initialForm(() => data.updateForm),
		{
			id: 'updateReview',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) editingId = null;
			}
		}
	);
	const {
		form: updateForm,
		errors: updateErrors,
		submitting: updateSubmitting,
		message: updateMessage,
		enhance: updateEnhance
	} = updateSuperform;
	const {
		enhance: addMediaEnhance,
		submitting: addMediaSubmitting,
		message: addMediaMessage
	} = superForm(
		initialForm(() => data.addMediaForm),
		{
			id: 'addReviewMedia',
			resetForm: true
		}
	);
	const { enhance: reorderEnhance, message: reorderMessage } = superForm(
		initialForm(() => data.reorderForm),
		{
			id: 'reorderReviewMedia',
			resetForm: false
		}
	);

	const actionMessage = $derived(
		form?.form?.message ?? $updateMessage ?? $addMediaMessage ?? $reorderMessage
	);

	function startEdit(review: PageData['reviewsResult']['items'][number]) {
		editingId = review.id;
		$updateForm.reviewId = review.id;
		$updateForm.rating = review.rating;
		$updateForm.title = review.title;
		$updateForm.body = review.body;
		$updateErrors = {};
	}

	function openDeleteDialog(target: NonNullable<typeof deleteTarget>) {
		deleteTarget = target;
		deleteOpen = true;
	}

	function closeDeleteDialog() {
		deleteOpen = false;
		deleteTarget = null;
	}

	const enhanceDelete: SubmitFunction = () => {
		deleting = true;
		return async ({ result, update }) => {
			try {
				await update();
				if (result.type === 'success') closeDeleteDialog();
			} finally {
				deleting = false;
			}
		};
	};

	function reorderedIds(
		media: PageData['reviewsResult']['items'][number]['media'],
		index: number,
		direction: -1 | 1
	): string[] {
		const next = [...media];
		const target = index + direction;
		[next[index], next[target]] = [next[target], next[index]];
		return next.map((item) => item.id);
	}

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' }).format(new Date(value));
	}
</script>

<svelte:head>
	<title>My Reviews | Caro Clothing</title>
	<meta name="description" content="Edit your Caro reviews and review media" />
</svelte:head>

<div class="space-y-8">
	<header class="border-b border-charcoal pb-6">
		<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">Your feedback</p>
		<h2 class="mt-2 font-display text-4xl leading-none uppercase sm:text-5xl">Reviews.</h2>
		<p class="mt-3 text-sm text-ash">{data.reviewsResult.total} reviews submitted.</p>
	</header>

	{#if actionMessage}
		<p
			class="border border-volt/30 bg-volt/8 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
			role="status"
		>
			{actionMessage}
		</p>
	{/if}

	<div class="space-y-6">
		{#each data.reviewsResult.items as review (review.id)}
			<article class="border-y border-charcoal py-6">
				<div
					class="grid grid-cols-[72px_minmax(0,1fr)] gap-4 sm:grid-cols-[72px_1fr_auto] sm:gap-5"
				>
					{#if review.product?.primaryImageUrl}
						<img
							src={review.product.primaryImageUrl}
							alt=""
							class="h-24 w-18 bg-charcoal object-cover"
						/>
					{:else}
						<div class="flex h-24 w-18 items-center justify-center bg-charcoal/40">
							<MessageSquare size={20} class="text-ash/50" aria-hidden="true" />
						</div>
					{/if}
					<div>
						<div class="flex flex-wrap items-center gap-3">
							<h3 class="font-mono text-xs tracking-widest text-bone uppercase">
								{review.product?.name ?? 'Product'}
							</h3>
							<span
								class="flex items-center gap-1 border px-2 py-1 font-mono text-[8px] tracking-widest uppercase {review.isApproved
									? 'border-volt/30 text-volt'
									: 'border-ash/25 text-ash'}"
							>
								<ShieldCheck size={11} aria-hidden="true" />
								{review.isApproved ? 'Published' : 'In moderation'}
							</span>
						</div>
						<div class="mt-3 flex gap-1 text-volt" aria-label={`${review.rating} out of 5 stars`}>
							{#each [1, 2, 3, 4, 5] as rating (rating)}
								<Star
									size={14}
									fill={rating <= review.rating ? 'currentColor' : 'none'}
									aria-hidden="true"
								/>
							{/each}
						</div>
						<p class="mt-2 font-mono text-[9px] text-ash">{formatDate(review.createdAt)}</p>
					</div>
					{#if editingId !== review.id}
						<div class="col-span-2 grid grid-cols-2 gap-2 sm:col-auto sm:flex sm:items-start">
							<button
								type="button"
								onclick={() => startEdit(review)}
								class="flex min-h-11 items-center justify-center gap-2 px-3 font-mono text-[9px] tracking-widest text-volt uppercase hover:text-bone"
							>
								<Pencil size={13} aria-hidden="true" />
								Edit
							</button>
							<button
								type="button"
								onclick={() =>
									openDeleteDialog({
										type: 'review',
										id: review.id,
										label: review.product?.name ?? 'review'
									})}
								class="flex min-h-11 items-center justify-center gap-2 px-3 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:text-red-200"
							>
								<Trash2 size={13} aria-hidden="true" />
								Delete
							</button>
						</div>
					{/if}
				</div>

				{#if editingId === review.id}
					<form
						method="POST"
						action="?/update"
						use:updateEnhance
						novalidate
						class="mt-6 grid max-w-2xl gap-4 border-t border-charcoal pt-5"
					>
						<input type="hidden" name="reviewId" bind:value={$updateForm.reviewId} />
						<fieldset>
							<legend class="font-mono text-[9px] tracking-widest text-ash uppercase">Rating</legend
							>
							<div class="mt-2 flex gap-1">
								{#each [1, 2, 3, 4, 5] as rating (rating)}
									<button
										type="button"
										onclick={() => ($updateForm.rating = rating)}
										class="min-h-11 min-w-11 text-volt"
										aria-label={`Set rating to ${rating} stars`}
									>
										<Star
											size={20}
											class="mx-auto"
											fill={rating <= ($updateForm.rating ?? 0) ? 'currentColor' : 'none'}
											aria-hidden="true"
										/>
									</button>
								{/each}
							</div>
							<input type="hidden" name="rating" bind:value={$updateForm.rating} />
							{#if $updateErrors.rating}
								<p class="mt-1 text-xs text-red-300" role="alert">{$updateErrors.rating[0]}</p>
							{/if}
						</fieldset>
						<label class="space-y-2">
							<span class="block font-mono text-[9px] tracking-widest text-ash uppercase"
								>Title</span
							>
							<input
								name="title"
								bind:value={$updateForm.title}
								maxlength="150"
								aria-invalid={$updateErrors.title ? 'true' : undefined}
								class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.title}
								<span class="text-xs text-red-300" role="alert">{$updateErrors.title[0]}</span>
							{/if}
						</label>
						<label class="space-y-2">
							<span class="block font-mono text-[9px] tracking-widest text-ash uppercase"
								>Review</span
							>
							<textarea
								name="body"
								bind:value={$updateForm.body}
								rows="5"
								maxlength="2000"
								aria-invalid={$updateErrors.body ? 'true' : undefined}
								class="w-full border border-charcoal bg-void p-4 text-sm leading-relaxed outline-none focus:border-volt"
							></textarea>
							{#if $updateErrors.body}
								<span class="text-xs text-red-300" role="alert">{$updateErrors.body[0]}</span>
							{/if}
						</label>
						<p class="text-xs text-ash">
							Edits return the review to moderation before it appears publicly.
						</p>
						<div class="grid gap-3 sm:flex">
							<button
								type="submit"
								disabled={$updateSubmitting}
								class="min-h-11 bg-volt px-5 font-mono text-[9px] tracking-widest text-void uppercase hover:bg-bone disabled:cursor-wait disabled:opacity-50"
								>{$updateSubmitting ? 'Saving...' : 'Save review'}</button
							>
							<button
								type="button"
								onclick={() => (editingId = null)}
								class="min-h-11 border border-charcoal px-4 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone"
								>Cancel</button
							>
						</div>
					</form>
				{:else}
					<div class="mt-5 max-w-3xl">
						{#if review.title}<h4 class="font-display text-2xl uppercase">{review.title}</h4>{/if}
						{#if review.body}<p class="mt-2 text-sm leading-relaxed text-bone/85">
								{review.body}
							</p>{/if}
					</div>
				{/if}

				<div class="mt-6 border-t border-charcoal pt-5">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">Photos</p>
							<p class="mt-1 text-xs text-ash/70">{review.media.length}/5 images</p>
						</div>
						{#if review.media.length < 5}
							<form
								method="POST"
								action="?/addMedia"
								use:addMediaEnhance
								enctype="multipart/form-data"
								class="flex flex-wrap items-center gap-2"
							>
								<input type="hidden" name="reviewId" value={review.id} />
								<label
									class="flex min-h-11 cursor-pointer items-center gap-2 border border-charcoal px-4 font-mono text-[9px] tracking-widest text-bone uppercase hover:border-volt hover:text-volt"
								>
									<ImagePlus size={14} aria-hidden="true" />
									Add photos
									<input
										name="files"
										type="file"
										accept="image/jpeg,image/png,image/webp,image/avif"
										multiple
										required
										class="sr-only"
										onchange={(event) => event.currentTarget.form?.requestSubmit()}
										disabled={$addMediaSubmitting}
									/>
								</label>
							</form>
						{/if}
					</div>

					{#if review.media.length > 0}
						<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
							{#each review.media as media, index (media.id)}
								<div class="border border-charcoal bg-charcoal/15 p-2">
									<img
										src={media.mediaUrl}
										alt={`Review photo ${index + 1}`}
										loading="lazy"
										decoding="async"
										width="400"
										height="400"
										class="aspect-square w-full object-cover"
									/>
									<div class="mt-2 flex items-center justify-between">
										<div class="flex">
											{#if index > 0}
												<form method="POST" action="?/reorderMedia" use:reorderEnhance>
													<input type="hidden" name="reviewId" value={review.id} />
													{#each reorderedIds(review.media, index, -1) as mediaId (mediaId)}<input
															type="hidden"
															name="mediaIdsInOrder"
															value={mediaId}
														/>{/each}
													<button
														class="min-h-11 min-w-9 text-ash hover:text-volt"
														aria-label="Move media left"
														><ChevronLeft size={15} class="mx-auto" aria-hidden="true" /></button
													>
												</form>
											{/if}
											{#if index < review.media.length - 1}
												<form method="POST" action="?/reorderMedia" use:reorderEnhance>
													<input type="hidden" name="reviewId" value={review.id} />
													{#each reorderedIds(review.media, index, 1) as mediaId (mediaId)}<input
															type="hidden"
															name="mediaIdsInOrder"
															value={mediaId}
														/>{/each}
													<button
														class="min-h-11 min-w-9 text-ash hover:text-volt"
														aria-label="Move media right"
														><ChevronRight size={15} class="mx-auto" aria-hidden="true" /></button
													>
												</form>
											{/if}
										</div>
										<button
											type="button"
											onclick={() =>
												openDeleteDialog({
													type: 'media',
													id: media.id,
													label: `media ${index + 1}`
												})}
											class="min-h-11 min-w-9 text-red-300 hover:text-red-200"
											aria-label={`Delete review media ${index + 1}`}
											><Trash2 size={14} class="mx-auto" aria-hidden="true" /></button
										>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</article>
		{:else}
			<div class="border border-dashed border-charcoal py-20 text-center">
				<MessageSquare class="mx-auto text-ash/50" size={30} aria-hidden="true" />
				<h3 class="mt-4 font-display text-3xl uppercase">No reviews yet.</h3>
				<p class="mt-2 text-sm text-ash">Review eligible products from their product page.</p>
				<a
					href={resolve('/account/orders')}
					class="mt-6 inline-flex min-h-11 items-center bg-volt px-6 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone"
					>View orders</a
				>
			</div>
		{/each}
	</div>
</div>

<Dialog.Root bind:open={deleteOpen} onOpenChange={(open) => !open && (deleteTarget = null)}>
	{#if deleteOpen && deleteTarget}
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-50 bg-void/90" />
			<div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto px-4 py-6">
				<Dialog.Content
					class="w-full max-w-md border border-red-400/30 bg-charcoal p-6 outline-none"
				>
					<Dialog.Title class="font-display text-3xl uppercase"
						>Delete {deleteTarget.label}?</Dialog.Title
					>
					<Dialog.Description class="mt-3 text-sm text-ash">
						{deleteTarget.type === 'review'
							? 'The review and all attached media will be permanently removed.'
							: 'This file will be permanently removed from the review.'}
					</Dialog.Description>
					<form
						method="POST"
						action={deleteTarget.type === 'review' ? '?/delete' : '?/deleteMedia'}
						use:enhance={enhanceDelete}
						class="mt-6 grid gap-3 sm:grid-cols-2"
					>
						<input
							type="hidden"
							name={deleteTarget.type === 'review' ? 'reviewId' : 'mediaId'}
							value={deleteTarget.id}
						/>
						<button
							type="submit"
							disabled={deleting}
							class="min-h-11 bg-red-400 px-4 font-mono text-[9px] tracking-widest text-void uppercase hover:bg-red-300"
							>{deleting ? 'Deleting...' : 'Delete permanently'}</button
						>
						<button
							type="button"
							onclick={closeDeleteDialog}
							disabled={deleting}
							class="min-h-11 border border-ash/30 px-4 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone"
							>Cancel</button
						>
					</form>
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
