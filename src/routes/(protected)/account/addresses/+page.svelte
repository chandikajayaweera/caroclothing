<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	type CreateAddressForm = PageData['form'];
	type ActionForm = NonNullable<ActionData>['form'];

	function isCreateAddressForm(form: ActionForm | undefined): form is CreateAddressForm {
		return form?.id === 'createAddress';
	}

	const createForm = $derived(isCreateAddressForm(actionData?.form) ? actionData.form : data.form);
	const actionMessage = $derived(actionData?.form?.message);
	const addresses = $derived(data.addresses.items);
</script>

<svelte:head>
	<title>Addresses | Caro Clothing</title>
	<meta name="description" content="Your saved addresses" />
</svelte:head>

<div class="flex flex-col gap-8">
	<div class="flex items-baseline justify-between">
		<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Saved Addresses</h2>
		<span class="font-mono text-[9px] tracking-widest text-ash/60 uppercase">
			{data.addresses.total} saved
		</span>
	</div>

	{#if actionMessage}
		<p
			class="border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
		>
			{actionMessage}
		</p>
	{/if}

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each addresses as address}
			<div
				class="flex flex-col gap-4 border border-transparent bg-charcoal/40 p-5 transition-colors hover:border-ash/10"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] tracking-widest text-volt uppercase">
							{address.label || 'Address'}
						</span>
						{#if address.isDefault}
							<span
								class="w-fit border border-volt/30 px-1.5 py-0.5 font-mono text-[8px] text-volt uppercase"
							>
								Default
							</span>
						{/if}
					</div>

					<div class="flex flex-wrap justify-end gap-3">
						{#if !address.isDefault}
							<form method="POST" action="?/setDefault">
								<input type="hidden" name="addressId" value={address.id} />
								<button
									class="font-mono text-[9px] tracking-widest text-ash/60 uppercase hover:text-bone"
								>
									Default
								</button>
							</form>
						{/if}

						<form method="POST" action="?/delete">
							<input type="hidden" name="addressId" value={address.id} />
							<button
								class="font-mono text-[9px] tracking-widest text-red-400/60 uppercase hover:text-red-400"
							>
								Delete
							</button>
						</form>
					</div>
				</div>

				<div class="flex flex-col font-sans text-sm leading-relaxed text-bone">
					<span class="font-medium">{address.recipientName}</span>
					<span>{address.addressLine1}</span>
					{#if address.addressLine2}
						<span>{address.addressLine2}</span>
					{/if}
					<span>{address.city}, {address.district}</span>
					{#if address.postalCode}
						<span>{address.postalCode}</span>
					{/if}
					<span class="pt-2 font-mono text-[10px] text-ash">{address.phone}</span>
				</div>
			</div>
		{/each}

		{#if addresses.length === 0}
			<div class="border border-dashed border-ash/20 p-8">
				<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
					No saved addresses yet
				</p>
			</div>
		{/if}
	</div>

	<form
		method="POST"
		action="?/create"
		class="grid grid-cols-1 gap-5 border border-charcoal p-5 md:grid-cols-2"
	>
		<div class="md:col-span-2">
			<h3 class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Add Address</h3>
		</div>

		<label class="flex flex-col gap-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Label</span>
			<input
				name="label"
				value={createForm.data.label ?? ''}
				class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
				placeholder="Home"
			/>
			{#if createForm.errors.label}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.label[0]}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Recipient</span>
			<input
				name="recipientName"
				value={createForm.data.recipientName ?? ''}
				class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
				required
			/>
			{#if createForm.errors.recipientName}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.recipientName[0]}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Phone</span>
			<input
				name="phone"
				value={createForm.data.phone ?? ''}
				class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
				placeholder="0771234567"
				required
			/>
			{#if createForm.errors.phone}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.phone[0]}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">District</span>
			<select
				name="district"
				class="border-b border-charcoal bg-void py-3 font-mono text-sm text-bone outline-none focus:border-volt"
				required
			>
				<option value="">Select district</option>
				{#each data.districts as district}
					<option value={district.value} selected={createForm.data.district === district.value}>
						{district.label}
					</option>
				{/each}
			</select>
			{#if createForm.errors.district}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.district[0]}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-2 md:col-span-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Address Line 1</span>
			<input
				name="addressLine1"
				value={createForm.data.addressLine1 ?? ''}
				class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
				required
			/>
			{#if createForm.errors.addressLine1}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.addressLine1[0]}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-2 md:col-span-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Address Line 2</span>
			<input
				name="addressLine2"
				value={createForm.data.addressLine2 ?? ''}
				class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
			/>
			{#if createForm.errors.addressLine2}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.addressLine2[0]}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">City</span>
			<input
				name="city"
				value={createForm.data.city ?? ''}
				class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
				required
			/>
			{#if createForm.errors.city}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.city[0]}</span>
			{/if}
		</label>

		<label class="flex flex-col gap-2">
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Postal Code</span>
			<input
				name="postalCode"
				value={createForm.data.postalCode ?? ''}
				class="border-b border-charcoal bg-transparent py-3 font-mono text-sm text-bone outline-none focus:border-volt"
			/>
			{#if createForm.errors.postalCode}
				<span class="font-mono text-[9px] text-red-400">{createForm.errors.postalCode[0]}</span>
			{/if}
		</label>

		<label class="flex items-center gap-3 md:col-span-2">
			<input
				type="checkbox"
				name="isDefault"
				value="true"
				checked={createForm.data.isDefault === true}
				class="size-4 accent-volt"
			/>
			<span class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Use as default</span>
		</label>

		<div class="md:col-span-2">
			<button
				class="bg-bone px-6 py-3 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-volt"
			>
				Save Address
			</button>
		</div>
	</form>
</div>
