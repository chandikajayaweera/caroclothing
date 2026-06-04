<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form } = $props();

	let editingReviewId = $state<string | null>(null);
	let editRating = $state(5);
	let editText = $state('');
	let isSubmitting = $state(false);

	function startEdit(review: any) {
		editingReviewId = review.id;
		editRating = review.rating;
		editText = review.body || '';
	}

	function cancelEdit() {
		editingReviewId = null;
	}
</script>

<svelte:head>
	<title>My Reviews | Caro Clothing</title>
	<meta name="description" content="Manage your reviews" />
</svelte:head>

<div class="flex flex-col gap-8 text-bone">
	<div class="flex items-baseline justify-between border-b border-charcoal pb-4">
		<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">My Reviews</h2>
		<span class="font-mono text-[9px] tracking-widest text-ash/60 uppercase">
			{data.reviewsResult.total} reviews
		</span>
	</div>

	{#if form?.error}
		<div class="border border-red-500 bg-red-950/20 p-4 font-mono text-xs text-red-400">
			{form.error}
		</div>
	{/if}

	<div class="flex flex-col gap-6">
		{#each data.reviewsResult.items as item}
			<div class="border border-charcoal bg-charcoal/20 p-6 flex flex-col gap-4">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div class="flex flex-col gap-1">
						<span class="font-mono text-xs font-bold uppercase text-bone">
							{item.product?.name || 'Product'}
						</span>
						<div class="flex items-center gap-1 text-volt">
							{#each Array(5) as _, i}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill={i < item.rating ? 'currentColor' : 'none'}
									stroke="currentColor"
									stroke-width="2"
									class="lucide lucide-star"
								>
									<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
								</svg>
							{/each}
						</div>
					</div>

					<div class="flex items-center gap-4">
						{#if !item.isApproved}
							<span class="border border-ash/20 px-2 py-0.5 font-mono text-[8px] text-ash uppercase">
								Pending Approval
							</span>
						{:else}
							<span class="border border-volt/20 px-2 py-0.5 font-mono text-[8px] text-volt uppercase">
								Approved
							</span>
						{/if}

						{#if editingReviewId !== item.id}
							<button
								type="button"
								onclick={() => startEdit(item)}
								class="font-mono text-[9px] tracking-widest text-volt uppercase hover:underline"
							>
								Edit
							</button>
						{/if}
					</div>
				</div>

				{#if editingReviewId === item.id}
					<form
						method="POST"
						action="?/update"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ result, update }) => {
								isSubmitting = false;
								if (result.type === 'success') {
									editingReviewId = null;
								}
								await update();
							};
						}}
						class="mt-2 flex flex-col gap-4 border-t border-charcoal pt-4"
					>
						<input type="hidden" name="reviewId" value={item.id} />

						<div class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Rating</span>
							<div class="flex gap-2">
								{#each [1, 2, 3, 4, 5] as rate}
									<button
										type="button"
										onclick={() => editRating = rate}
										class="p-1 text-volt transition-colors"
										aria-label="Rate {rate} stars"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="20"
											height="20"
											viewBox="0 0 24 24"
											fill={rate <= editRating ? 'currentColor' : 'none'}
											stroke="currentColor"
											stroke-width="2"
										>
											<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
										</svg>
									</button>
								{/each}
								<input type="hidden" name="rating" value={editRating} />
							</div>
						</div>

						<div class="flex flex-col gap-2">
							<label for="edit-text-field" class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Review text</label>
							<textarea
								id="edit-text-field"
								name="text"
								bind:value={editText}
								rows="4"
								class="border border-charcoal bg-void p-3 font-sans text-sm text-bone outline-none focus:border-volt"
								required
							></textarea>
						</div>

						<div class="flex gap-3">
							<Button
								type="submit"
								variant="primary"
								disabled={isSubmitting}
								class="py-2.5 px-6 font-mono text-[10px] tracking-widest uppercase"
							>
								{isSubmitting ? 'Saving...' : 'Save Changes'}
							</Button>
							<Button
								type="button"
								variant="secondary"
								onclick={cancelEdit}
								class="py-2.5 px-6 font-mono text-[10px] tracking-widest uppercase"
							>
								Cancel
							</Button>
						</div>
					</form>
				{:else}
					<p class="font-sans text-sm leading-relaxed text-bone/90">
						{item.body}
					</p>
					<span class="font-mono text-[9px] text-ash/40">
						Reviewed on {new Date(item.createdAt).toLocaleDateString()}
					</span>
				{/if}
			</div>
		{:else}
			<div class="border border-dashed border-charcoal p-12 text-center">
				<p class="font-mono text-xs text-ash uppercase">You haven't reviewed any products yet.</p>
			</div>
		{/each}
	</div>
</div>
