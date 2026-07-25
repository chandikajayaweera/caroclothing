<script lang="ts">
	import { Pause, Play, ShieldCheck, TicketPercent, Users } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminDateTimePicker from '$lib/components/admin/controls/AdminDateTimePicker.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminUnsavedChangesGuard from '$lib/components/admin/forms/AdminUnsavedChangesGuard.svelte';
	import AdminDetailLayout from '$lib/components/admin/layout/AdminDetailLayout.svelte';
	import {
		formatAdminDateTime,
		formatAdminDiscount,
		formatAdminMoney
	} from '$lib/shared/admin/format';
	import { promotionStatusVariant } from '$lib/shared/admin/status';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const {
		form: updateForm,
		errors: updateErrors,
		enhance: updateEnhance,
		message: updateMessage,
		submitting: updateSubmitting,
		tainted: updateTainted
	} = superForm(
		initialForm(() => data.updateForm),
		{ resetForm: false }
	);

	let updateFormElement = $state<HTMLFormElement | null>(null);
	const actionMessage = $derived(actionData?.form?.message ?? $updateMessage);
	const usagePercent = $derived(
		data.promotion.usageLimit
			? Math.min(100, Math.round((data.promotion.usedCount / data.promotion.usageLimit) * 100))
			: null
	);
</script>

<AdminDetailLayout
	backHref="/app/promotions"
	backLabel="Back to promotions"
	kicker="Promotion management"
	title={data.promotion.name}
	subtitle={data.promotion.publicTitle ?? 'Internal promotion'}
	{actionMessage}
	actionMessageClass="border-volt/30 bg-volt/10 text-volt"
	mobileSidebarLabel="Lifecycle and usage"
>
	{#snippet mainContent()}
		<form
			method="POST"
			action="?/update"
			novalidate
			bind:this={updateFormElement}
			use:updateEnhance
		>
			<input type="hidden" name="promotionId" value={data.promotion.id} />
			<input type="hidden" name="applicationMode" value={data.promotion.applicationMode} />

			<AdminCard kicker="Policy" title="Promotion rule" border="border border-ash/15">
				<div class="mb-5 flex flex-wrap items-center gap-2">
					<AdminBadge variant={promotionStatusVariant(data.promotion.status)}>
						{data.promotion.status}
					</AdminBadge>
					<AdminBadge variant="accent">{data.promotion.applicationMode}</AdminBadge>
					<AdminBadge>{data.promotion.visibility}</AdminBadge>
					<AdminBadge>{data.promotion.eligibilityScope.replaceAll('_', ' ')}</AdminBadge>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<AdminInput
						label="Internal name"
						name="name"
						bind:value={$updateForm.name}
						error={$updateErrors.name}
						required
					/>
					<AdminInput
						label="Public title"
						name="publicTitle"
						bind:value={$updateForm.publicTitle}
						error={$updateErrors.publicTitle}
					/>
					<AdminSelect
						label="Discount type"
						name="discountType"
						bind:value={$updateForm.discountType}
						error={$updateErrors.discountType}
						required
					>
						<option value="fixed">Fixed LKR</option>
						<option value="percentage">Percentage</option>
					</AdminSelect>
					<AdminInput
						label="Discount value"
						name="discountValue"
						type="number"
						min="1"
						bind:value={$updateForm.discountValue}
						error={$updateErrors.discountValue}
						required
					/>
					<AdminInput
						label="Minimum order"
						name="minOrderAmount"
						type="number"
						min="0"
						bind:value={$updateForm.minOrderAmount}
						error={$updateErrors.minOrderAmount}
						placeholder="No minimum"
					/>
					<AdminInput
						label="Maximum discount"
						name="maxDiscountAmount"
						type="number"
						min="1"
						bind:value={$updateForm.maxDiscountAmount}
						error={$updateErrors.maxDiscountAmount}
						placeholder="No cap"
					/>
					<AdminInput
						label="Overall usage limit"
						name="usageLimit"
						type="number"
						min="1"
						bind:value={$updateForm.usageLimit}
						error={$updateErrors.usageLimit}
						placeholder="Unlimited"
					/>
					<AdminInput
						label="Per-customer limit"
						name="perUserLimit"
						type="number"
						min="1"
						bind:value={$updateForm.perUserLimit}
						error={$updateErrors.perUserLimit}
						required
					/>
					<AdminSelect
						label="Eligibility"
						name="eligibilityScope"
						bind:value={$updateForm.eligibilityScope}
						error={$updateErrors.eligibilityScope}
						required
					>
						<option value="all">All customers</option>
						<option value="authenticated">Signed-in customers</option>
						<option value="customer_grant">Granted customers</option>
					</AdminSelect>
					<AdminSelect
						label="Visibility"
						name="visibility"
						bind:value={$updateForm.visibility}
						error={$updateErrors.visibility}
						helpText="Visibility never activates a promotion."
						required
					>
						<option value="internal">Internal</option>
						<option value="unlisted">Unlisted</option>
						<option value="public">Public placement eligible</option>
					</AdminSelect>
					<AdminInput
						label="Priority"
						name="priority"
						type="number"
						min="0"
						bind:value={$updateForm.priority}
						error={$updateErrors.priority}
						required
					/>
					<div class="flex min-h-11 items-end">
						<div class="w-full border border-charcoal bg-void/35 px-4 py-3">
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
								Application mode
							</p>
							<p class="mt-1 text-sm text-bone capitalize">{data.promotion.applicationMode}</p>
						</div>
					</div>
					<div class="sm:col-span-2">
						<AdminTextarea
							label="Internal note"
							name="internalDescription"
							bind:value={$updateForm.internalDescription}
							error={$updateErrors.internalDescription}
							rows={3}
						/>
					</div>
					<div class="sm:col-span-2">
						<AdminTextarea
							label="Public description"
							name="publicDescription"
							bind:value={$updateForm.publicDescription}
							error={$updateErrors.publicDescription}
							rows={3}
						/>
					</div>
					<AdminDateTimePicker
						label="Starts at"
						name="startsAt"
						bind:value={$updateForm.startsAt}
						error={$updateErrors.startsAt}
					/>
					<AdminDateTimePicker
						label="Expires at"
						name="expiresAt"
						bind:value={$updateForm.expiresAt}
						error={$updateErrors.expiresAt}
					/>
				</div>

				<div class="mt-6 flex justify-end border-t border-ash/10 pt-5">
					<AdminButton type="submit" variant="volt" size="md" disabled={$updateSubmitting}>
						{$updateSubmitting ? 'Saving...' : 'Save promotion'}
					</AdminButton>
				</div>
			</AdminCard>
		</form>

		{#if data.promotion.applicationMode === 'code'}
			<AdminCard
				kicker="Redemption"
				title="Codes"
				border="border border-ash/15"
				class="overflow-hidden"
			>
				<p class="mb-5 text-xs leading-relaxed text-ash/70">
					Each code controls its own distribution, channel, discoverability, and child lifecycle.
				</p>

				<div class="grid gap-4">
					{#each data.promotion.codes as code (code.id)}
						<form
							method="POST"
							action="?/updateCode"
							class="grid min-w-0 gap-4 border border-charcoal bg-void/35 p-4 sm:grid-cols-2"
						>
							<input type="hidden" name="promoCodeId" value={code.id} />
							<div class="flex flex-wrap items-center gap-2 sm:col-span-2">
								<AdminBadge variant={code.codeIsActive ? 'success' : 'neutral'} size="xs">
									{code.codeIsActive ? 'active code' : 'paused code'}
								</AdminBadge>
								<AdminBadge size="xs">{code.usedCount} used</AdminBadge>
								{#if code.remainingUses !== null}
									<AdminBadge size="xs">{code.remainingUses} remaining</AdminBadge>
								{/if}
							</div>
							<AdminInput label="Code" name="code" value={code.code} required />
							<AdminSelect label="Distribution" name="distribution" value={code.distribution}>
								<option value="private">Private</option>
								<option value="public">Public</option>
								<option value="influencer">Influencer</option>
								<option value="internal">Internal</option>
							</AdminSelect>
							<AdminSelect
								label="Redemption channel"
								name="redemptionChannel"
								value={code.redemptionChannel}
							>
								<option value="storefront">Storefront</option>
								<option value="admin">Admin</option>
								<option value="both">Both</option>
							</AdminSelect>
							<AdminInput
								label="Usage limit"
								name="codeUsageLimit"
								type="number"
								min="1"
								value={code.usageLimit}
								placeholder="Inherit promotion limit"
							/>
							<AdminInput
								label="Partner reference"
								name="partnerReference"
								value={code.partnerReference}
							/>
							<div class="grid gap-2 sm:grid-cols-2">
								<div class="border border-ash/20 px-3">
									<AdminToggle
										label="Discoverable"
										name="isDiscoverable"
										checked={code.isDiscoverable}
									/>
								</div>
								<div class="border border-ash/20 px-3">
									<AdminToggle label="Active" name="isActive" checked={code.codeIsActive} />
								</div>
							</div>
							<div class="flex items-end justify-end sm:col-span-2">
								<AdminButton type="submit" variant="outline" size="sm">Save code</AdminButton>
							</div>
						</form>
					{:else}
						<AdminEmptyState
							title="No redemption codes"
							description="Add a code before activating this promotion."
							size="compact"
						/>
					{/each}
				</div>

				<form
					method="POST"
					action="?/addCode"
					class="mt-5 grid min-w-0 gap-4 border border-dashed border-ash/25 p-4 sm:grid-cols-2"
				>
					<input type="hidden" name="promotionId" value={data.promotion.id} />
					<div class="sm:col-span-2">
						<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">Add code</p>
					</div>
					<AdminInput label="Code" name="code" placeholder="NEWCODE" required />
					<AdminSelect label="Distribution" name="distribution" value="private">
						<option value="private">Private</option>
						<option value="public">Public</option>
						<option value="influencer">Influencer</option>
						<option value="internal">Internal</option>
					</AdminSelect>
					<AdminSelect label="Redemption channel" name="redemptionChannel" value="storefront">
						<option value="storefront">Storefront</option>
						<option value="admin">Admin</option>
						<option value="both">Both</option>
					</AdminSelect>
					<AdminInput
						label="Usage limit"
						name="codeUsageLimit"
						type="number"
						min="1"
						placeholder="Inherit promotion limit"
					/>
					<AdminInput label="Partner reference" name="partnerReference" />
					<div class="border border-ash/20 px-3">
						<AdminToggle label="Discoverable" name="isDiscoverable" checked={false} />
					</div>
					<div class="flex items-end justify-end sm:col-span-2">
						<AdminButton type="submit" variant="outline">Add redemption code</AdminButton>
					</div>
				</form>
			</AdminCard>
		{/if}

		{#if data.promotion.eligibilityScope === 'customer_grant'}
			<AdminCard kicker="Eligibility" title="Customer grants" border="border border-ash/15">
				<form method="POST" action="?/grant" class="grid gap-4 sm:grid-cols-2">
					<input type="hidden" name="promotionId" value={data.promotion.id} />
					<AdminInput
						label="Customer user ID"
						name="userId"
						placeholder="Better Auth user ID"
						required
					/>
					<div class="hidden sm:block"></div>
					<AdminDateTimePicker label="Grant starts at" name="startsAt" />
					<AdminDateTimePicker label="Grant expires at" name="expiresAt" />
					<div class="flex justify-end sm:col-span-2">
						<AdminButton type="submit" variant="outline">Grant access</AdminButton>
					</div>
				</form>

				<div class="mt-5 grid gap-3 sm:grid-cols-2">
					{#each data.grants as grant (grant.id)}
						<div class="min-w-0 border border-charcoal bg-void/35 p-4">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate font-mono text-xs text-bone">{grant.userId}</p>
									<p class="mt-2 text-xs leading-relaxed text-ash/70">
										{formatAdminDateTime(grant.startsAt, 'Starts immediately')}<br />
										{formatAdminDateTime(grant.expiresAt, 'No expiry')}
									</p>
								</div>
								<Users size={17} class="shrink-0 text-volt" aria-hidden="true" />
							</div>
							<form method="POST" action="?/revokeGrant" class="mt-4">
								<input type="hidden" name="promotionId" value={data.promotion.id} />
								<input type="hidden" name="userId" value={grant.userId} />
								<input type="hidden" name="startsAt" value="" />
								<input type="hidden" name="expiresAt" value="" />
								<AdminButton type="submit" variant="danger" size="sm" class="w-full">
									Revoke access
								</AdminButton>
							</form>
						</div>
					{:else}
						<div class="sm:col-span-2">
							<AdminEmptyState
								title="No customer grants"
								description="Grant access to eligible customer accounts."
								size="compact"
							/>
						</div>
					{/each}
				</div>
			</AdminCard>
		{/if}

		<AdminCard kicker="Audit" title="Redemption history" border="border border-ash/15">
			<p class="mb-5 text-xs leading-relaxed text-ash/70">
				Append-only order usage. Records are visible here but are not generic CRUD.
			</p>

			<div class="grid gap-3 xl:hidden">
				{#each data.usages.items as usage (usage.id)}
					<div class="border border-charcoal bg-void/35 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="truncate font-mono text-xs text-bone">{usage.orderId}</p>
								<p class="mt-1 text-xs text-ash">
									{usage.promoCode?.code ?? 'Automatic'} · {usage.userId ?? 'Guest'}
								</p>
							</div>
							<p class="shrink-0 font-mono text-xs text-volt">
								{formatAdminMoney(usage.discountAmount)}
							</p>
						</div>
						<p class="mt-3 font-mono text-[9px] tracking-wider text-ash uppercase">
							{formatAdminDateTime(usage.usedAt)}
						</p>
					</div>
				{:else}
					<AdminEmptyState
						title="No redemptions"
						description="Usage will appear after a completed order applies this promotion."
						size="compact"
					/>
				{/each}
			</div>

			{#if data.usages.items.length > 0}
				<div class="hidden overflow-x-auto xl:block">
					<table class="w-full min-w-[760px] text-left">
						<thead class="border-b border-charcoal">
							<tr class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">
								<th class="px-4 py-3 font-normal">Order</th>
								<th class="px-4 py-3 font-normal">Code</th>
								<th class="px-4 py-3 font-normal">Customer</th>
								<th class="px-4 py-3 font-normal">Discount</th>
								<th class="px-4 py-3 font-normal">Used</th>
							</tr>
						</thead>
						<tbody>
							{#each data.usages.items as usage (usage.id)}
								<tr class="border-b border-charcoal/70 last:border-b-0">
									<td class="px-4 py-4 font-mono text-xs text-bone">{usage.orderId}</td>
									<td class="px-4 py-4 text-xs text-bone">
										{usage.promoCode?.code ?? 'Automatic'}
									</td>
									<td class="px-4 py-4 font-mono text-[10px] text-ash">
										{usage.userId ?? 'Guest'}
									</td>
									<td class="px-4 py-4 font-mono text-xs text-volt">
										{formatAdminMoney(usage.discountAmount)}
									</td>
									<td class="px-4 py-4 font-mono text-[10px] text-ash">
										{formatAdminDateTime(usage.usedAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</AdminCard>
	{/snippet}

	{#snippet sidebarContent()}
		<AdminCard
			kicker="Lifecycle"
			title="Launch control"
			border="border border-ash/15"
			padding="p-5"
		>
			<div class="flex items-center justify-between gap-3">
				<AdminBadge variant={promotionStatusVariant(data.promotion.status)}>
					{data.promotion.status}
				</AdminBadge>
				{#if data.promotion.isActive}
					<ShieldCheck size={20} class="text-volt" aria-hidden="true" />
				{:else}
					<TicketPercent size={20} class="text-ash" aria-hidden="true" />
				{/if}
			</div>

			<p class="mt-5 font-display text-4xl leading-none text-bone uppercase">
				{formatAdminDiscount(data.promotion.discountType, data.promotion.discountValue)}
			</p>
			<p class="mt-2 text-xs leading-relaxed text-ash/70">
				{data.promotion.publicTitle ?? data.promotion.name}
			</p>

			<div class="mt-5 grid gap-2 font-mono text-[10px] uppercase">
				<div class="flex justify-between gap-3 border-b border-ash/10 py-2">
					<span class="text-ash/60">Starts</span>
					<span class="text-right text-bone">
						{formatAdminDateTime(data.promotion.startsAt, 'Immediately')}
					</span>
				</div>
				<div class="flex justify-between gap-3 border-b border-ash/10 py-2">
					<span class="text-ash/60">Expires</span>
					<span class="text-right text-bone">
						{formatAdminDateTime(data.promotion.expiresAt, 'No expiry')}
					</span>
				</div>
				<div class="flex justify-between gap-3 py-2">
					<span class="text-ash/60">Priority</span>
					<span class="text-bone">{data.promotion.priority}</span>
				</div>
			</div>

			<form method="POST" action="?/setActive" class="mt-5">
				<input type="hidden" name="promotionId" value={data.promotion.id} />
				<input type="hidden" name="isActive" value={String(!data.promotion.isActive)} />
				<AdminButton
					type="submit"
					variant={data.promotion.isActive ? 'danger' : 'volt'}
					size="md"
					class="w-full"
				>
					{#if data.promotion.isActive}
						<Pause size={15} aria-hidden="true" />
						Pause promotion
					{:else}
						<Play size={15} aria-hidden="true" />
						Activate promotion
					{/if}
				</AdminButton>
			</form>
		</AdminCard>

		<AdminCard kicker="Usage" title="Limits" border="border border-ash/15" padding="p-5">
			<div class="grid grid-cols-2 gap-3">
				<div class="border border-charcoal bg-void/35 p-3">
					<p class="font-mono text-[8px] tracking-wider text-ash uppercase">Used</p>
					<p class="mt-2 font-display text-3xl text-bone">{data.promotion.usedCount}</p>
				</div>
				<div class="border border-charcoal bg-void/35 p-3">
					<p class="font-mono text-[8px] tracking-wider text-ash uppercase">Remaining</p>
					<p class="mt-2 font-display text-3xl text-volt">
						{data.promotion.remainingUses ?? '∞'}
					</p>
				</div>
			</div>
			{#if usagePercent !== null}
				<div class="mt-4">
					<div class="mb-2 flex justify-between font-mono text-[9px] text-ash uppercase">
						<span>Usage progress</span>
						<span>{usagePercent}%</span>
					</div>
					<div class="h-1.5 overflow-hidden bg-void">
						<div class="h-full bg-volt" style:width={`${usagePercent}%`}></div>
					</div>
				</div>
			{/if}
			<div class="mt-4 flex justify-between gap-3 font-mono text-[10px] uppercase">
				<span class="text-ash/60">Per customer</span>
				<span class="text-bone">{data.promotion.perUserLimit}</span>
			</div>
		</AdminCard>
	{/snippet}
</AdminDetailLayout>

<AdminUnsavedChangesGuard
	dirty={Boolean($updateTainted) && !$updateSubmitting}
	title="Leave promotion management?"
	description="Promotion policy changes have not been saved."
	onsave={() => updateFormElement?.requestSubmit()}
/>
