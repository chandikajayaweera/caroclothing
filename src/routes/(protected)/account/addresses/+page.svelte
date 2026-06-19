<script lang="ts">
	import { enhance as kitEnhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Dialog } from 'bits-ui';
	import { CheckCircle2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	function initialShowCreate() {
		return (
			data.addresses.total === 0 ||
			(actionData?.form?.id === 'createAddress' && actionData.form.valid === false)
		);
	}

	function initialCreateForm() {
		return data.form;
	}

	function initialUpdateForm() {
		return data.updateForm;
	}

	let showCreate = $state(initialShowCreate());
	let editingId = $state<string | null>(null);
	let deleteOpen = $state(false);
	let deleteTarget = $state<{ id: string; label: string } | null>(null);
	let pendingMutation = $state<string | null>(null);

	const createSuperform = superForm(initialCreateForm(), {
		id: 'createAddress',
		resetForm: true,
		onUpdated({ form }) {
			showCreate = true;
			if (form.valid) {
				$createForm.isDefault = false;
			}
		}
	});
	const {
		form: createForm,
		errors: createErrors,
		message: createMessage,
		submitting: createSubmitting,
		enhance: createEnhance
	} = createSuperform;

	const updateSuperform = superForm(initialUpdateForm(), {
		id: 'updateAddress',
		resetForm: false,
		onUpdated({ form }) {
			if (form.valid) editingId = null;
		}
	});
	const {
		form: updateForm,
		errors: updateErrors,
		message: updateMessage,
		submitting: updateSubmitting,
		enhance: updateEnhance
	} = updateSuperform;

	const actionMessage = $derived(actionData?.form?.message ?? $createMessage ?? $updateMessage);

	function startEdit(address: PageData['addresses']['items'][number]) {
		$updateForm.addressId = address.id;
		$updateForm.label = address.label;
		$updateForm.recipientName = address.recipientName;
		$updateForm.phone = address.phone;
		$updateForm.addressLine1 = address.addressLine1;
		$updateForm.addressLine2 = address.addressLine2;
		$updateForm.city = address.city;
		$updateForm.district = address.district;
		$updateForm.postalCode = address.postalCode;
		$updateForm.isDefault = address.isDefault;
		$updateErrors = {};
		editingId = address.id;
	}

	function openDeleteDialog(address: PageData['addresses']['items'][number]) {
		deleteTarget = { id: address.id, label: address.label || 'address' };
		deleteOpen = true;
	}

	function closeDeleteDialog() {
		deleteOpen = false;
		deleteTarget = null;
	}

	function enhanceMutation(key: string, closeDelete = false): SubmitFunction {
		return () => {
			pendingMutation = key;

			return async ({ result, update }) => {
				try {
					await update({ reset: false });
					if (closeDelete && result.type === 'success') closeDeleteDialog();
				} finally {
					pendingMutation = null;
				}
			};
		};
	}
</script>

<svelte:head>
	<title>Saved Addresses | Caro Clothing</title>
	<meta name="description" content="Manage your saved delivery addresses" />
</svelte:head>

<div class="space-y-8">
	<header
		class="flex flex-col gap-5 border-b border-charcoal pb-6 sm:flex-row sm:items-end sm:justify-between"
	>
		<div>
			<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">Delivery details</p>
			<h2 class="mt-2 font-display text-4xl leading-none uppercase sm:text-5xl">Addresses.</h2>
			<p class="mt-3 text-sm text-ash">{data.addresses.total} saved for faster checkout.</p>
		</div>
		<button
			type="button"
			onclick={() => (showCreate = !showCreate)}
			aria-expanded={showCreate}
			aria-controls="create-address-form"
			class="flex min-h-11 w-full items-center justify-center gap-2 bg-volt px-5 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone sm:w-auto"
		>
			<Plus size={15} aria-hidden="true" />
			{showCreate ? 'Close form' : 'Add address'}
		</button>
	</header>

	{#if actionMessage}
		<p
			class="flex items-center gap-2 border border-volt/30 bg-volt/8 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
			role="status"
		>
			<CheckCircle2 size={15} aria-hidden="true" />
			{actionMessage}
		</p>
	{/if}

	{#if showCreate}
		<form
			id="create-address-form"
			method="POST"
			action="?/create"
			use:createEnhance
			novalidate
			class="grid gap-5 border-y border-charcoal bg-charcoal/15 px-4 py-6 sm:px-5 md:grid-cols-2"
		>
			<div class="md:col-span-2">
				<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">New address</p>
				<h3 class="mt-1 font-display text-3xl uppercase">Where should it land?</h3>
				<p class="mt-2 text-xs text-ash">Fields marked required must be completed.</p>
			</div>

			<label class="space-y-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">Label</span>
				<input
					name="label"
					bind:value={$createForm.label}
					placeholder="Home"
					aria-invalid={$createErrors.label ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm text-bone outline-none focus:border-volt"
				/>
				{#if $createErrors.label}
					<span class="text-xs text-red-300" role="alert">{$createErrors.label[0]}</span>
				{/if}
			</label>
			<label class="space-y-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">
					Recipient <span class="text-volt">*</span>
				</span>
				<input
					name="recipientName"
					autocomplete="name"
					bind:value={$createForm.recipientName}
					aria-invalid={$createErrors.recipientName ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm text-bone outline-none focus:border-volt"
				/>
				{#if $createErrors.recipientName}
					<span class="text-xs text-red-300" role="alert">{$createErrors.recipientName[0]}</span>
				{/if}
			</label>
			<label class="space-y-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">
					Phone <span class="text-volt">*</span>
				</span>
				<input
					name="phone"
					type="tel"
					inputmode="tel"
					autocomplete="tel"
					bind:value={$createForm.phone}
					placeholder="0771234567"
					aria-invalid={$createErrors.phone ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 font-mono text-sm text-bone outline-none focus:border-volt"
				/>
				{#if $createErrors.phone}
					<span class="text-xs text-red-300" role="alert">{$createErrors.phone[0]}</span>
				{/if}
			</label>
			<label class="space-y-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">
					District <span class="text-volt">*</span>
				</span>
				<select
					name="district"
					bind:value={$createForm.district}
					aria-invalid={$createErrors.district ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm text-bone outline-none focus:border-volt"
				>
					<option value={undefined}>Select district</option>
					{#each data.districts as district (district.value)}
						<option value={district.value}>{district.label}</option>
					{/each}
				</select>
				{#if $createErrors.district}
					<span class="text-xs text-red-300" role="alert">{$createErrors.district[0]}</span>
				{/if}
			</label>
			<label class="space-y-2 md:col-span-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">
					Address line 1 <span class="text-volt">*</span>
				</span>
				<input
					name="addressLine1"
					autocomplete="address-line1"
					bind:value={$createForm.addressLine1}
					aria-invalid={$createErrors.addressLine1 ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm text-bone outline-none focus:border-volt"
				/>
				{#if $createErrors.addressLine1}
					<span class="text-xs text-red-300" role="alert">{$createErrors.addressLine1[0]}</span>
				{/if}
			</label>
			<label class="space-y-2 md:col-span-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">
					Address line 2
				</span>
				<input
					name="addressLine2"
					autocomplete="address-line2"
					bind:value={$createForm.addressLine2}
					aria-invalid={$createErrors.addressLine2 ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm text-bone outline-none focus:border-volt"
				/>
				{#if $createErrors.addressLine2}
					<span class="text-xs text-red-300" role="alert">{$createErrors.addressLine2[0]}</span>
				{/if}
			</label>
			<label class="space-y-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">
					City <span class="text-volt">*</span>
				</span>
				<input
					name="city"
					autocomplete="address-level2"
					bind:value={$createForm.city}
					aria-invalid={$createErrors.city ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm text-bone outline-none focus:border-volt"
				/>
				{#if $createErrors.city}
					<span class="text-xs text-red-300" role="alert">{$createErrors.city[0]}</span>
				{/if}
			</label>
			<label class="space-y-2">
				<span class="block font-mono text-[9px] tracking-widest text-ash uppercase">
					Postal code
				</span>
				<input
					name="postalCode"
					autocomplete="postal-code"
					inputmode="numeric"
					bind:value={$createForm.postalCode}
					aria-invalid={$createErrors.postalCode ? 'true' : undefined}
					class="min-h-12 w-full border border-charcoal bg-void px-4 text-sm text-bone outline-none focus:border-volt"
				/>
				{#if $createErrors.postalCode}
					<span class="text-xs text-red-300" role="alert">{$createErrors.postalCode[0]}</span>
				{/if}
			</label>
			<label class="flex min-h-11 items-center gap-3 md:col-span-2">
				<input
					type="checkbox"
					name="isDefault"
					bind:checked={$createForm.isDefault}
					class="size-4 accent-volt"
				/>
				<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Use as default</span>
			</label>
			<div class="md:col-span-2">
				<button
					type="submit"
					disabled={$createSubmitting}
					class="min-h-11 w-full bg-bone px-6 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-volt disabled:cursor-wait disabled:opacity-50 sm:w-auto"
				>
					{$createSubmitting ? 'Saving...' : 'Save address'}
				</button>
			</div>
		</form>
	{/if}

	<div class="grid gap-4 md:grid-cols-2">
		{#each data.addresses.items as address (address.id)}
			<article class="min-w-0 border border-charcoal bg-charcoal/15 p-4 sm:p-5">
				<div class="flex gap-3">
					<MapPin class="mt-0.5 shrink-0 text-volt" size={18} aria-hidden="true" />
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="font-mono text-xs tracking-widest uppercase">
								{address.label || 'Address'}
							</h3>
							{#if address.isDefault}
								<span
									class="border border-volt/30 px-2 py-0.5 font-mono text-[8px] text-volt uppercase"
								>
									Default
								</span>
							{/if}
						</div>
						<p class="mt-3 text-sm font-medium text-bone">{address.recipientName}</p>
						<p class="mt-1 text-sm leading-relaxed break-words text-ash">{address.singleLine}</p>
						<p class="mt-2 font-mono text-[10px] text-ash">{address.phone}</p>
					</div>
				</div>

				<div class="mt-5 grid grid-cols-2 gap-2 border-t border-charcoal pt-4 sm:flex sm:flex-wrap">
					<button
						type="button"
						onclick={() => (editingId === address.id ? (editingId = null) : startEdit(address))}
						aria-expanded={editingId === address.id}
						class="flex min-h-11 items-center justify-center gap-2 px-3 font-mono text-[9px] tracking-widest text-volt uppercase hover:text-bone"
					>
						<Pencil size={13} aria-hidden="true" />
						Edit
					</button>
					{#if !address.isDefault}
						<form
							method="POST"
							action="?/setDefault"
							use:kitEnhance={enhanceMutation(`default:${address.id}`)}
						>
							<input type="hidden" name="addressId" value={address.id} />
							<button
								type="submit"
								disabled={pendingMutation === `default:${address.id}`}
								class="flex min-h-11 w-full items-center justify-center gap-2 px-3 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone disabled:opacity-50"
							>
								<Star size={13} aria-hidden="true" />
								{pendingMutation === `default:${address.id}` ? 'Saving...' : 'Make default'}
							</button>
						</form>
					{/if}
					<button
						type="button"
						onclick={() => openDeleteDialog(address)}
						class="col-span-2 flex min-h-11 items-center justify-center gap-2 px-3 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:text-red-200 sm:ml-auto"
					>
						<Trash2 size={13} aria-hidden="true" />
						Delete
					</button>
				</div>

				{#if editingId === address.id}
					<form
						method="POST"
						action="?/update"
						use:updateEnhance
						novalidate
						class="mt-5 grid gap-4 border-t border-charcoal pt-5 sm:grid-cols-2"
					>
						<input type="hidden" name="addressId" bind:value={$updateForm.addressId} />
						<label class="space-y-1">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">Label</span>
							<input
								name="label"
								bind:value={$updateForm.label}
								aria-invalid={$updateErrors.label ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.label}
								<span class="text-xs text-red-300" role="alert">{$updateErrors.label[0]}</span>
							{/if}
						</label>
						<label class="space-y-1">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">Recipient</span>
							<input
								name="recipientName"
								autocomplete="name"
								bind:value={$updateForm.recipientName}
								aria-invalid={$updateErrors.recipientName ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.recipientName}
								<span class="text-xs text-red-300" role="alert"
									>{$updateErrors.recipientName[0]}</span
								>
							{/if}
						</label>
						<label class="space-y-1">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">Phone</span>
							<input
								name="phone"
								type="tel"
								inputmode="tel"
								autocomplete="tel"
								bind:value={$updateForm.phone}
								aria-invalid={$updateErrors.phone ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.phone}
								<span class="text-xs text-red-300" role="alert">{$updateErrors.phone[0]}</span>
							{/if}
						</label>
						<label class="space-y-1">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">District</span>
							<select
								name="district"
								bind:value={$updateForm.district}
								aria-invalid={$updateErrors.district ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							>
								{#each data.districts as district (district.value)}
									<option value={district.value}>{district.label}</option>
								{/each}
							</select>
							{#if $updateErrors.district}
								<span class="text-xs text-red-300" role="alert">{$updateErrors.district[0]}</span>
							{/if}
						</label>
						<label class="space-y-1 sm:col-span-2">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">
								Address line 1
							</span>
							<input
								name="addressLine1"
								autocomplete="address-line1"
								bind:value={$updateForm.addressLine1}
								aria-invalid={$updateErrors.addressLine1 ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.addressLine1}
								<span class="text-xs text-red-300" role="alert"
									>{$updateErrors.addressLine1[0]}</span
								>
							{/if}
						</label>
						<label class="space-y-1 sm:col-span-2">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">
								Address line 2
							</span>
							<input
								name="addressLine2"
								autocomplete="address-line2"
								bind:value={$updateForm.addressLine2}
								aria-invalid={$updateErrors.addressLine2 ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.addressLine2}
								<span class="text-xs text-red-300" role="alert"
									>{$updateErrors.addressLine2[0]}</span
								>
							{/if}
						</label>
						<label class="space-y-1">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">City</span>
							<input
								name="city"
								autocomplete="address-level2"
								bind:value={$updateForm.city}
								aria-invalid={$updateErrors.city ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.city}
								<span class="text-xs text-red-300" role="alert">{$updateErrors.city[0]}</span>
							{/if}
						</label>
						<label class="space-y-1">
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">
								Postal code
							</span>
							<input
								name="postalCode"
								autocomplete="postal-code"
								inputmode="numeric"
								bind:value={$updateForm.postalCode}
								aria-invalid={$updateErrors.postalCode ? 'true' : undefined}
								class="min-h-11 w-full border border-charcoal bg-void px-3 text-sm outline-none focus:border-volt"
							/>
							{#if $updateErrors.postalCode}
								<span class="text-xs text-red-300" role="alert">{$updateErrors.postalCode[0]}</span>
							{/if}
						</label>
						<label class="flex min-h-11 items-center gap-3 sm:col-span-2">
							<input
								type="checkbox"
								name="isDefault"
								bind:checked={$updateForm.isDefault}
								class="size-4 accent-volt"
							/>
							<span class="font-mono text-[8px] tracking-widest text-ash uppercase">
								Use as default
							</span>
						</label>
						<div class="grid gap-3 sm:col-span-2 sm:flex">
							<button
								type="submit"
								disabled={$updateSubmitting}
								class="min-h-11 bg-volt px-5 font-mono text-[9px] tracking-widest text-void uppercase hover:bg-bone disabled:cursor-wait disabled:opacity-50"
							>
								{$updateSubmitting ? 'Saving...' : 'Save changes'}
							</button>
							<button
								type="button"
								onclick={() => (editingId = null)}
								class="min-h-11 border border-charcoal px-4 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone"
							>
								Cancel
							</button>
						</div>
					</form>
				{/if}
			</article>
		{:else}
			<div class="border border-dashed border-charcoal py-16 text-center md:col-span-2">
				<MapPin class="mx-auto text-ash/50" size={28} aria-hidden="true" />
				<h3 class="mt-4 font-display text-3xl uppercase">No addresses yet.</h3>
				<p class="mt-2 text-sm text-ash">Add one now to move faster at checkout.</p>
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
					class="w-full max-w-md border border-red-400/30 bg-charcoal p-5 outline-none sm:p-6"
				>
					<Dialog.Title class="font-display text-3xl uppercase">
						Delete {deleteTarget.label}?
					</Dialog.Title>
					<Dialog.Description class="mt-3 text-sm text-ash">
						This saved address will be removed from your account.
					</Dialog.Description>
					<form
						method="POST"
						action="?/delete"
						use:kitEnhance={enhanceMutation(`delete:${deleteTarget.id}`, true)}
						class="mt-6 grid gap-3 sm:grid-cols-2"
					>
						<input type="hidden" name="addressId" value={deleteTarget.id} />
						<button
							type="submit"
							disabled={pendingMutation === `delete:${deleteTarget.id}`}
							class="min-h-11 bg-red-400 px-4 font-mono text-[9px] tracking-widest text-void uppercase hover:bg-red-300 disabled:cursor-wait disabled:opacity-50"
						>
							{pendingMutation === `delete:${deleteTarget.id}` ? 'Deleting...' : 'Delete address'}
						</button>
						<button
							type="button"
							onclick={closeDeleteDialog}
							disabled={pendingMutation === `delete:${deleteTarget.id}`}
							class="min-h-11 border border-ash/30 px-4 font-mono text-[9px] tracking-widest text-ash uppercase hover:border-bone hover:text-bone disabled:opacity-50"
						>
							Cancel
						</button>
					</form>
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
