<script lang="ts">
	let { data } = $props();

	const ownerTypeOptions = [
		{ value: '', label: 'All owners' },
		{ value: 'user', label: 'User carts' },
		{ value: 'guest', label: 'Guest carts' }
	];

	function formatDate(value: Date | string | null): string {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

<svelte:head>
	<title>Bag | Caro Admin</title>
	<meta
		name="description"
		content="Inspect guest and user bags, session ownership, item rows, expiry behavior, merge state, and locked unit prices."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Services</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">Bag</h1>
		</div>

		<form method="POST" action="?/deleteExpired" class="mt-5 flex gap-2 md:mt-0">
			<input type="hidden" name="limit" value="100" />
			<button
				type="submit"
				class="bg-volt px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone"
			>
				Clean Expired
			</button>
		</form>
	</div>

	<div class="mt-8 grid gap-4 lg:grid-cols-[1fr_340px]">
		<div class="border border-charcoal bg-charcoal/25">
			<div class="border-b border-charcoal p-5">
				<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
					{data.carts.total} carts tracked
				</p>
			</div>

			{#if data.carts.items.length > 0}
				<div class="overflow-x-auto">
					<table class="w-full min-w-[900px] text-left">
						<thead class="border-b border-charcoal">
							<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
								<th class="px-5 py-4 font-normal">Owner</th>
								<th class="px-5 py-4 font-normal">Items</th>
								<th class="px-5 py-4 font-normal">Subtotal</th>
								<th class="px-5 py-4 font-normal">Unavailable</th>
								<th class="px-5 py-4 font-normal">Expires</th>
								<th class="px-5 py-4 font-normal">Updated</th>
							</tr>
						</thead>
						<tbody>
							{#each data.carts.items as cart (cart.id)}
								<tr class="border-b border-charcoal/70 last:border-b-0">
									<td class="px-5 py-4">
										<div class="flex flex-col gap-1">
											<span class="font-mono text-xs text-bone uppercase">{cart.ownerType}</span>
											<span class="max-w-[220px] truncate font-mono text-[10px] text-ash">
												{cart.userId ?? cart.sessionToken ?? cart.id}
											</span>
										</div>
									</td>
									<td class="px-5 py-4 font-mono text-xs text-bone">
										{cart.itemCount}
									</td>
									<td class="px-5 py-4 font-mono text-xs text-bone">
										LKR {cart.subtotal.toLocaleString()}
									</td>
									<td class="px-5 py-4">
										<span
											class="font-mono text-[10px] tracking-widest uppercase {cart.hasUnavailableItems
												? 'text-volt'
												: 'text-ash'}"
										>
											{cart.hasUnavailableItems ? 'Review' : 'Clear'}
										</span>
									</td>
									<td class="px-5 py-4 font-mono text-[10px] text-ash">
										{formatDate(cart.expiresAt)}
									</td>
									<td class="px-5 py-4 font-mono text-[10px] text-ash">
										{formatDate(cart.updatedAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="p-12 text-center">
					<p class="font-display text-4xl text-bone uppercase">No carts found</p>
					<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
						Adjust filters or wait for customer activity.
					</p>
				</div>
			{/if}
		</div>

		<aside class="border border-charcoal bg-void p-5">
			<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Filters</p>
			<form method="GET" class="mt-5 flex flex-col gap-4">
				<label class="flex flex-col gap-2">
					<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Owner</span>
					<select
						name="ownerType"
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					>
						{#each ownerTypeOptions as option (option.value)}
							<option value={option.value} selected={data.filters.ownerType === option.value}>
								{option.label}
							</option>
						{/each}
					</select>
				</label>

				<label class="flex flex-col gap-2">
					<span class="font-mono text-[9px] tracking-widest text-ash uppercase">User ID</span>
					<input
						name="userId"
						value={data.filters.userId}
						class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
					/>
				</label>

				<label
					class="flex items-center gap-3 font-mono text-[10px] tracking-widest text-ash uppercase"
				>
					<input
						type="checkbox"
						name="includeExpired"
						value="true"
						checked={data.filters.includeExpired}
						class="h-4 w-4"
					/>
					Include expired
				</label>

				<input type="hidden" name="limit" value={data.filters.limit} />
				<button
					type="submit"
					class="border border-ash/30 px-5 py-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:border-volt hover:text-volt"
				>
					Apply Filters
				</button>
			</form>
		</aside>
	</div>
</section>
