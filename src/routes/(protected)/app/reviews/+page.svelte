<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	const statusOptions = [
		{ value: '', label: 'All statuses' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'approved', label: 'Approved' }
	];
	const verifiedOptions = [
		{ value: '', label: 'All reviews' },
		{ value: 'verified', label: 'Verified' },
		{ value: 'unverified', label: 'Unverified' }
	];
	const ratingOptions = ['', '5', '4', '3', '2', '1'];

	const actionMessage = $derived(actionData?.form?.message);

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	function approvalClass(isApproved: boolean): string {
		return isApproved ? 'text-volt' : 'text-yellow-300';
	}

	function productLabel(review: PageData['reviews']['items'][number]): string {
		return review.product?.name ?? review.productId;
	}
</script>

<svelte:head>
	<title>Reviews | Caro Admin</title>
	<meta
		name="description"
		content="Moderate product reviews, review media, verified purchase state, and admin notes."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Customers</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">
				Reviews
			</h1>
		</div>

		<div class="mt-5 grid grid-cols-2 gap-3 text-right md:mt-0 md:grid-cols-4">
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Total</p>
				<p class="mt-1 font-display text-3xl text-bone uppercase">{data.summary.totalCount}</p>
			</div>
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Pending</p>
				<p class="mt-1 font-display text-3xl text-yellow-300 uppercase">
					{data.summary.pendingCount}
				</p>
			</div>
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Verified</p>
				<p class="mt-1 font-display text-3xl text-volt uppercase">
					{data.summary.verifiedCount}
				</p>
			</div>
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Avg</p>
				<p class="mt-1 font-display text-3xl text-bone uppercase">
					{data.summary.averageRating ?? 'NA'}
				</p>
			</div>
		</div>
	</div>

	{#if actionMessage}
		<p
			class="mt-6 border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
		>
			{actionMessage}
		</p>
	{/if}

	<div class="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
		<div class="flex flex-col gap-4">
			<div class="border border-charcoal bg-charcoal/25">
				<div class="border-b border-charcoal p-5">
					<div class="items-center justify-between gap-4 md:flex">
						<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
							{data.reviews.total} reviews
						</p>
						<form method="GET" class="mt-4 flex flex-wrap gap-2 md:mt-0">
							<input
								name="query"
								value={data.filters.query}
								placeholder="Title or body"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							/>
							<input
								name="productId"
								value={data.filters.productId}
								placeholder="Product ID"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							/>
							<select
								name="status"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							>
								{#each statusOptions as option (option.value)}
									<option value={option.value} selected={data.filters.status === option.value}>
										{option.label}
									</option>
								{/each}
							</select>
							<select
								name="verified"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							>
								{#each verifiedOptions as option (option.value)}
									<option value={option.value} selected={data.filters.verified === option.value}>
										{option.label}
									</option>
								{/each}
							</select>
							<select
								name="rating"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							>
								{#each ratingOptions as rating (rating)}
									<option value={rating} selected={data.filters.rating === rating}>
										{rating ? `${rating} stars` : 'Any rating'}
									</option>
								{/each}
							</select>
							<input type="hidden" name="limit" value={data.filters.limit} />
							<button
								class="border border-ash/30 px-4 py-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
							>
								Filter
							</button>
						</form>
					</div>
				</div>

				{#if data.reviews.items.length > 0}
					<div class="divide-y divide-charcoal">
						{#each data.reviews.items as review (review.id)}
							<article class="grid gap-5 p-5 lg:grid-cols-[160px_minmax(0,1fr)_260px]">
								<div>
									{#if review.product?.primaryImageUrl}
										<img
											src={review.product.primaryImageUrl}
											alt=""
											class="aspect-square w-full border border-charcoal object-cover"
										/>
									{:else}
										<div
											class="flex aspect-square w-full items-center justify-center border border-charcoal bg-void font-mono text-[10px] tracking-widest text-ash uppercase"
										>
											No image
										</div>
									{/if}
								</div>

								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-3">
										<p class="font-mono text-[10px] tracking-[0.2em] text-bone uppercase">
											{productLabel(review)}
										</p>
										<span
											class="font-mono text-[10px] tracking-widest uppercase {approvalClass(
												review.isApproved
											)}"
										>
											{review.isApproved ? 'Approved' : 'Pending'}
										</span>
										{#if review.isVerifiedPurchase}
											<span class="font-mono text-[10px] tracking-widest text-volt uppercase">
												Verified
											</span>
										{/if}
									</div>

									<p class="mt-3 font-display text-3xl leading-none text-bone uppercase">
										{review.rating}/5
										{#if review.title}
											<span class="text-ash"> {review.title}</span>
										{/if}
									</p>

									{#if review.body}
										<p class="mt-3 max-w-2xl text-sm leading-6 text-ash">{review.body}</p>
									{/if}

									<div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-ash">
										<span>{review.reviewerName}</span>
										<span>{formatDate(review.createdAt)}</span>
										<span class="max-w-full truncate">{review.userId}</span>
										{#if review.orderId}
											<span class="max-w-full truncate">{review.orderId}</span>
										{/if}
									</div>

									{#if review.adminNote}
										<p class="mt-4 border-l border-volt pl-3 text-xs leading-5 text-ash">
											{review.adminNote}
										</p>
									{/if}

									{#if review.media.length > 0}
										<div class="mt-4 flex flex-wrap gap-2">
											{#each review.media as media (media.id)}
												<div class="group relative border border-charcoal bg-void">
													{#if media.type === 'image'}
														<img src={media.mediaUrl} alt="" class="h-20 w-20 object-cover" />
													{:else}
														<video
															src={media.mediaUrl}
															controls
															muted
															class="h-20 w-20 object-cover"
														></video>
													{/if}
													<form method="POST" action="?/deleteMedia" class="absolute top-1 right-1">
														<input type="hidden" name="mediaId" value={media.id} />
														<button
															class="bg-void/90 px-2 py-1 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-red-400"
														>
															Remove
														</button>
													</form>
												</div>
											{/each}
										</div>
									{/if}
								</div>

								<div class="flex flex-col gap-3">
									<form method="POST" action="?/moderate" class="flex flex-col gap-3">
										<input type="hidden" name="reviewId" value={review.id} />
										<select
											name="isApproved"
											class="border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone"
										>
											<option value="true" selected={review.isApproved}>Approved</option>
											<option value="false" selected={!review.isApproved}>Pending</option>
										</select>
										<textarea
											name="adminNote"
											rows="4"
											placeholder="Admin note"
											class="resize-none border border-charcoal bg-void px-3 py-3 font-mono text-xs text-bone outline-none"
											>{review.adminNote ?? ''}</textarea
										>
										<button
											class="bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt"
										>
											Save
										</button>
									</form>

									<form method="POST" action="?/deleteReview">
										<input type="hidden" name="reviewId" value={review.id} />
										<button
											class="w-full border border-red-400/40 px-5 py-3 font-mono text-[10px] tracking-widest text-red-300 uppercase hover:border-red-300 hover:text-red-200"
										>
											Delete
										</button>
									</form>
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<div class="p-12 text-center">
						<p class="font-display text-4xl text-bone uppercase">No reviews found</p>
						<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
							Adjust filters or wait for customer feedback.
						</p>
					</div>
				{/if}
			</div>
		</div>

		<aside class="flex flex-col gap-4">
			<div class="border border-charcoal bg-void p-5">
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Pending Queue</h2>

				{#if data.pendingReviews.items.length > 0}
					<div class="mt-5 flex flex-col gap-4">
						{#each data.pendingReviews.items as review (review.id)}
							<div class="border-b border-charcoal pb-4 last:border-b-0 last:pb-0">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate font-mono text-[10px] tracking-widest text-bone uppercase">
											{productLabel(review)}
										</p>
										<p class="mt-1 font-mono text-[10px] text-ash">
											{review.rating}/5 by {review.reviewerName}
										</p>
									</div>
									<form method="POST" action="?/moderate">
										<input type="hidden" name="reviewId" value={review.id} />
										<input type="hidden" name="isApproved" value="true" />
										<button class="font-mono text-[10px] tracking-widest text-volt uppercase">
											Approve
										</button>
									</form>
								</div>
								{#if review.body}
									<p class="mt-2 line-clamp-2 text-xs leading-5 text-ash">{review.body}</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-5 font-mono text-[10px] tracking-widest text-ash uppercase">
						No pending reviews.
					</p>
				{/if}
			</div>

			<form
				method="POST"
				enctype="multipart/form-data"
				action="?/addMedia"
				class="border border-charcoal bg-void p-5"
			>
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Add Media</h2>
				<div class="mt-5 flex flex-col gap-3">
					<input
						name="reviewId"
						placeholder="Review ID"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
						required
					/>
					<input
						name="files"
						type="file"
						multiple
						accept="image/*,video/*"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-ash"
						required
					/>
					<button
						class="bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt"
					>
						Upload
					</button>
				</div>
			</form>
		</aside>
	</div>
</section>
