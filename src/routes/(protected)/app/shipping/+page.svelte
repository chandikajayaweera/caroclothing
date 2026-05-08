<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type CreateMethodForm = PageData['createMethodForm'];
	type SetZoneForm = PageData['setZoneForm'];
	type ActionForm = NonNullable<ActionData>['form'];

	function isCreateMethodForm(form: ActionForm | undefined): form is CreateMethodForm {
		return form?.id === 'createShippingMethod';
	}

	function isSetZoneForm(form: ActionForm | undefined): form is SetZoneForm {
		return form?.id === 'setShippingZone';
	}

	function formatMoney(value: number | null): string {
		if (value === null) return 'Never';
		return `LKR ${value.toLocaleString()}`;
	}

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	const createMethodForm = $derived(
		isCreateMethodForm(actionData?.form) ? actionData.form : data.createMethodForm
	);
	const setZoneForm = $derived(
		isSetZoneForm(actionData?.form) ? actionData.form : data.setZoneForm
	);
	const actionMessage = $derived(actionData?.form?.message);
	const methodNamesById = $derived(
		new Map(data.methods.items.map((method) => [method.id, method.name]))
	);
</script>

<svelte:head>
	<title>Shipping | Caro Admin</title>
	<meta
		name="description"
		content="Manage shipping methods, carriers, base prices, free-shipping thresholds, delivery estimates, and district zones."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Operations</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">
				Shipping
			</h1>
		</div>

		<div class="mt-5 grid grid-cols-2 gap-3 md:mt-0">
			<div class="border border-charcoal px-4 py-3 text-right">
				<p class="font-mono text-[9px] tracking-widest text-ash uppercase">Methods</p>
				<p class="font-mono text-lg text-bone">{data.methods.total}</p>
			</div>
			<div class="border border-charcoal px-4 py-3 text-right">
				<p class="font-mono text-[9px] tracking-widest text-ash uppercase">Zones</p>
				<p class="font-mono text-lg text-bone">{data.zones.total}</p>
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
							Shipping methods
						</p>
						<form method="GET" class="mt-4 flex flex-wrap gap-2 md:mt-0">
							<input
								name="query"
								value={data.filters.query}
								placeholder="Search methods"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							/>
							<select
								name="status"
								class="border border-charcoal bg-void px-3 py-2 font-mono text-[10px] text-bone outline-none"
							>
								<option value="" selected={data.filters.status === ''}>All</option>
								<option value="active" selected={data.filters.status === 'active'}>Active</option>
								<option value="inactive" selected={data.filters.status === 'inactive'}
									>Inactive</option
								>
							</select>
							<button
								class="border border-ash/30 px-4 py-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-volt hover:text-volt"
							>
								Filter
							</button>
						</form>
					</div>
				</div>

				{#if data.methods.items.length > 0}
					<div class="overflow-x-auto">
						<table class="w-full min-w-[980px] text-left">
							<thead class="border-b border-charcoal">
								<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
									<th class="px-5 py-4 font-normal">Method</th>
									<th class="px-5 py-4 font-normal">Base Price</th>
									<th class="px-5 py-4 font-normal">Free Over</th>
									<th class="px-5 py-4 font-normal">ETA</th>
									<th class="px-5 py-4 font-normal">Zones</th>
									<th class="px-5 py-4 font-normal">Updated</th>
									<th class="px-5 py-4 text-right font-normal">Status</th>
								</tr>
							</thead>
							<tbody>
								{#each data.methods.items as method (method.id)}
									<tr class="border-b border-charcoal/70 last:border-b-0">
										<td class="px-5 py-4">
											<div class="flex flex-col gap-1">
												<span class="font-mono text-xs text-bone uppercase">{method.name}</span>
												<span class="font-mono text-[10px] text-ash">
													{method.carrier ?? 'No carrier'}
												</span>
												{#if method.description}
													<span class="max-w-[260px] truncate font-sans text-xs text-ash/80">
														{method.description}
													</span>
												{/if}
											</div>
										</td>
										<td class="px-5 py-4 font-mono text-xs text-bone">
											{formatMoney(method.price)}
										</td>
										<td class="px-5 py-4 font-mono text-xs text-bone">
											{formatMoney(method.freeShippingThreshold)}
										</td>
										<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
											{method.etaText}
										</td>
										<td class="px-5 py-4 font-mono text-xs text-bone">
											{method.zones?.length ?? 0}
										</td>
										<td class="px-5 py-4 font-mono text-[10px] text-ash">
											{formatDate(method.updatedAt)}
										</td>
										<td class="px-5 py-4">
											<form method="POST" action="?/updateMethod" class="flex justify-end">
												<input type="hidden" name="shippingMethodId" value={method.id} />
												<input
													type="hidden"
													name="isActive"
													value={method.isActive ? 'false' : 'true'}
												/>
												<button
													class="font-mono text-[10px] tracking-widest uppercase {method.isActive
														? 'text-volt hover:text-bone'
														: 'text-ash hover:text-volt'}"
												>
													{method.isActive ? 'Active' : 'Inactive'}
												</button>
											</form>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="p-12 text-center">
						<p class="font-display text-4xl text-bone uppercase">No shipping methods</p>
						<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
							Create a method before checkout can quote delivery.
						</p>
					</div>
				{/if}
			</div>

			<div class="border border-charcoal bg-charcoal/25">
				<div class="border-b border-charcoal p-5">
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
						District overrides
					</p>
				</div>

				{#if data.zones.items.length > 0}
					<div class="overflow-x-auto">
						<table class="w-full min-w-[760px] text-left">
							<thead class="border-b border-charcoal">
								<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
									<th class="px-5 py-4 font-normal">District</th>
									<th class="px-5 py-4 font-normal">Method</th>
									<th class="px-5 py-4 font-normal">Price</th>
									<th class="px-5 py-4 font-normal">ETA</th>
									<th class="px-5 py-4 text-right font-normal">Action</th>
								</tr>
							</thead>
							<tbody>
								{#each data.zones.items as zone (zone.id)}
									<tr class="border-b border-charcoal/70 last:border-b-0">
										<td class="px-5 py-4 font-mono text-xs text-bone">{zone.district}</td>
										<td class="px-5 py-4 font-mono text-[10px] text-ash">
											{methodNamesById.get(zone.shippingMethodId) ?? zone.shippingMethodId}
										</td>
										<td class="px-5 py-4 font-mono text-xs text-bone">
											{formatMoney(zone.priceOverride)}
										</td>
										<td class="px-5 py-4 font-mono text-[10px] text-ash uppercase">
											{zone.etaText}
										</td>
										<td class="px-5 py-4">
											<form method="POST" action="?/removeZone" class="flex justify-end">
												<input
													type="hidden"
													name="shippingMethodId"
													value={zone.shippingMethodId}
												/>
												<input type="hidden" name="district" value={zone.district} />
												<button
													class="font-mono text-[10px] tracking-widest text-red-400/70 uppercase hover:text-red-400"
												>
													Remove
												</button>
											</form>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="p-8">
						<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
							No district overrides. Method defaults apply everywhere.
						</p>
					</div>
				{/if}
			</div>
		</div>

		<aside class="flex flex-col gap-4">
			<form method="POST" action="?/createMethod" class="border border-charcoal bg-void p-5">
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Add Method</h2>

				<div class="mt-5 flex flex-col gap-4">
					<label class="flex flex-col gap-2">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Name</span>
						<input
							name="name"
							value={createMethodForm.data.name ?? ''}
							class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
							required
						/>
						{#if createMethodForm.errors.name}
							<span class="font-mono text-[9px] text-red-400">
								{createMethodForm.errors.name[0]}
							</span>
						{/if}
					</label>

					<label class="flex flex-col gap-2">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Carrier</span>
						<input
							name="carrier"
							value={createMethodForm.data.carrier ?? ''}
							class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
						/>
					</label>

					<label class="flex flex-col gap-2">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Description</span>
						<textarea
							name="description"
							class="min-h-20 border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
							>{createMethodForm.data.description ?? ''}</textarea
						>
					</label>

					<div class="grid grid-cols-2 gap-3">
						<label class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Price</span>
							<input
								name="price"
								type="number"
								min="0"
								value={createMethodForm.data.price ?? ''}
								class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
								required
							/>
						</label>
						<label class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Free Over</span>
							<input
								name="freeShippingThreshold"
								type="number"
								min="0"
								value={createMethodForm.data.freeShippingThreshold ?? ''}
								class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
							/>
						</label>
					</div>

					<div class="grid grid-cols-3 gap-3">
						<label class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Min Days</span>
							<input
								name="estimatedDaysMin"
								type="number"
								min="0"
								value={createMethodForm.data.estimatedDaysMin ?? ''}
								class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
								required
							/>
						</label>
						<label class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Max Days</span>
							<input
								name="estimatedDaysMax"
								type="number"
								min="1"
								value={createMethodForm.data.estimatedDaysMax ?? ''}
								class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
								required
							/>
							{#if createMethodForm.errors.estimatedDaysMax}
								<span class="font-mono text-[9px] text-red-400">
									{createMethodForm.errors.estimatedDaysMax[0]}
								</span>
							{/if}
						</label>
						<label class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Sort</span>
							<input
								name="sortOrder"
								type="number"
								min="0"
								value={createMethodForm.data.sortOrder ?? 0}
								class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
							/>
						</label>
					</div>

					<input type="hidden" name="isActive" value="false" />
					<label class="flex items-center gap-3">
						<input
							type="checkbox"
							name="isActive"
							value="true"
							checked={createMethodForm.data.isActive ?? true}
							class="size-4 accent-volt"
						/>
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Active</span>
					</label>

					<button
						class="bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt"
					>
						Save Method
					</button>
				</div>
			</form>

			<form method="POST" action="?/setZone" class="border border-charcoal bg-void p-5">
				<h2 class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Set Zone</h2>

				<div class="mt-5 flex flex-col gap-4">
					<label class="flex flex-col gap-2">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Method</span>
						<select
							name="shippingMethodId"
							class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
							required
						>
							<option value="">Select method</option>
							{#each data.methods.items as method (method.id)}
								<option
									value={method.id}
									selected={setZoneForm.data.shippingMethodId === method.id}
								>
									{method.name}
								</option>
							{/each}
						</select>
						{#if setZoneForm.errors.shippingMethodId}
							<span class="font-mono text-[9px] text-red-400">
								{setZoneForm.errors.shippingMethodId[0]}
							</span>
						{/if}
					</label>

					<label class="flex flex-col gap-2">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase">District</span>
						<select
							name="district"
							class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
							required
						>
							<option value="">Select district</option>
							{#each data.districts as district (district.value)}
								<option
									value={district.value}
									selected={setZoneForm.data.district === district.value}
								>
									{district.label}
								</option>
							{/each}
						</select>
						{#if setZoneForm.errors.district}
							<span class="font-mono text-[9px] text-red-400">
								{setZoneForm.errors.district[0]}
							</span>
						{/if}
					</label>

					<label class="flex flex-col gap-2">
						<span class="font-mono text-[9px] tracking-widest text-ash uppercase"
							>Override Price</span
						>
						<input
							name="priceOverride"
							type="number"
							min="0"
							value={setZoneForm.data.priceOverride ?? ''}
							class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
							required
						/>
					</label>

					<div class="grid grid-cols-2 gap-3">
						<label class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Min Days</span>
							<input
								name="estimatedDaysMin"
								type="number"
								min="0"
								value={setZoneForm.data.estimatedDaysMin ?? ''}
								class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
								required
							/>
						</label>
						<label class="flex flex-col gap-2">
							<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Max Days</span>
							<input
								name="estimatedDaysMax"
								type="number"
								min="1"
								value={setZoneForm.data.estimatedDaysMax ?? ''}
								class="border border-charcoal bg-charcoal/30 px-3 py-3 font-mono text-xs text-bone"
								required
							/>
							{#if setZoneForm.errors.estimatedDaysMax}
								<span class="font-mono text-[9px] text-red-400">
									{setZoneForm.errors.estimatedDaysMax[0]}
								</span>
							{/if}
						</label>
					</div>

					<button
						class="bg-bone px-5 py-3 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt"
					>
						Save Zone
					</button>
				</div>
			</form>
		</aside>
	</div>
</section>
