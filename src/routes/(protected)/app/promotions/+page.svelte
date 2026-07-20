<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { BadgePercent, ChevronDown, Plus } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import AdminPageShell from '$lib/components/admin/layout/AdminPageShell.svelte';
	import AdminPageHeader from '$lib/components/admin/layout/AdminPageHeader.svelte';
	import AdminSection from '$lib/components/admin/layout/AdminSection.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminDateTimePicker from '$lib/components/admin/controls/AdminDateTimePicker.svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();
	function initial<T>(read: () => T): T {
		return read();
	}
	const createSf = superForm(
		initial(() => data.createForm),
		{ resetForm: true }
	);
	const {
		form: createForm,
		errors: createErrors,
		enhance: createEnhance,
		submitting: createSubmitting
	} = createSf;
	let createOpen = $state(false);
	function statusTone(status: string) {
		return status === 'active'
			? 'success'
			: status === 'scheduled'
				? 'info'
				: status === 'expired' || status === 'exhausted'
					? 'warning'
					: 'neutral';
	}
</script>

<AdminPageShell>
	<AdminPageHeader
		kicker="Commerce"
		title="Promotions"
		description="Discount rules, eligibility, lifecycle, visibility, and optional redemption codes."
	>
		{#snippet actions()}<AdminButton onclick={() => (createOpen = !createOpen)}
				><Plus size={14} /> New promotion</AdminButton
			>{/snippet}
	</AdminPageHeader>
	{#if actionData?.form?.message}<p
			role="status"
			class="mt-5 border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
		>
			{actionData.form.message}
		</p>{/if}

	{#if createOpen}
		<form method="POST" action="?/create" use:createEnhance class="mt-7">
			<AdminSection
				title="Create promotion"
				description="New promotions remain inactive. Public visibility never applies a discount by itself."
			>
				<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<AdminInput
						label="Internal name"
						name="name"
						bind:value={$createForm.name}
						error={$createErrors.name}
						required
					/>
					<AdminInput
						label="Public title"
						name="publicTitle"
						bind:value={$createForm.publicTitle}
						error={$createErrors.publicTitle}
					/>
					<AdminSelect
						label="Application"
						name="applicationMode"
						bind:value={$createForm.applicationMode}
						error={$createErrors.applicationMode}
						><option value="code">Code</option><option value="automatic">Automatic</option
						></AdminSelect
					>
					<AdminSelect
						label="Discount type"
						name="discountType"
						bind:value={$createForm.discountType}
						error={$createErrors.discountType}
						><option value="fixed">Fixed LKR</option><option value="percentage">Percentage</option
						></AdminSelect
					>
					<AdminInput
						label="Discount value"
						name="discountValue"
						type="number"
						min="1"
						bind:value={$createForm.discountValue}
						error={$createErrors.discountValue}
					/>
					<AdminInput
						label="Minimum order"
						name="minOrderAmount"
						type="number"
						min="0"
						bind:value={$createForm.minOrderAmount}
						error={$createErrors.minOrderAmount}
					/>
					<AdminInput
						label="Max discount"
						name="maxDiscountAmount"
						type="number"
						min="1"
						bind:value={$createForm.maxDiscountAmount}
						error={$createErrors.maxDiscountAmount}
					/>
					<AdminInput
						label="Overall usage limit"
						name="usageLimit"
						type="number"
						min="1"
						bind:value={$createForm.usageLimit}
						error={$createErrors.usageLimit}
					/>
					<AdminInput
						label="Per-customer limit"
						name="perUserLimit"
						type="number"
						min="1"
						bind:value={$createForm.perUserLimit}
						error={$createErrors.perUserLimit}
					/>
					<AdminSelect
						label="Eligibility"
						name="eligibilityScope"
						bind:value={$createForm.eligibilityScope}
						><option value="all">All customers</option><option value="authenticated"
							>Signed-in customers</option
						><option value="customer_grant">Granted customers</option></AdminSelect
					>
					<AdminSelect label="Visibility" name="visibility" bind:value={$createForm.visibility}
						><option value="internal">Internal</option><option value="unlisted">Unlisted</option
						><option value="public">Public placement eligible</option></AdminSelect
					>
					<AdminInput
						label="Priority"
						name="priority"
						type="number"
						min="0"
						bind:value={$createForm.priority}
						error={$createErrors.priority}
					/>
					<div class="md:col-span-2 lg:col-span-3">
						<AdminTextarea
							label="Internal note"
							name="internalDescription"
							bind:value={$createForm.internalDescription}
							error={$createErrors.internalDescription}
						/>
					</div>
					<div class="md:col-span-2 lg:col-span-3">
						<AdminTextarea
							label="Public description"
							name="publicDescription"
							bind:value={$createForm.publicDescription}
							error={$createErrors.publicDescription}
						/>
					</div>
					{#if $createForm.applicationMode === 'code'}
						<AdminInput
							label="Redemption code"
							name="code"
							bind:value={$createForm.code}
							error={$createErrors.code}
							required
						/>
						<AdminSelect
							label="Distribution"
							name="distribution"
							bind:value={$createForm.distribution}
							><option value="private">Private</option><option value="public">Public</option><option
								value="influencer">Influencer</option
							><option value="internal">Internal</option></AdminSelect
						>
						<AdminSelect
							label="Redemption channel"
							name="redemptionChannel"
							bind:value={$createForm.redemptionChannel}
							><option value="storefront">Storefront</option><option value="admin">Admin</option
							><option value="both">Both</option></AdminSelect
						>
						<AdminInput
							label="Partner reference"
							name="partnerReference"
							bind:value={$createForm.partnerReference}
						/>
						<AdminInput
							label="Code usage limit"
							name="codeUsageLimit"
							type="number"
							min="1"
							bind:value={$createForm.codeUsageLimit}
						/>
						<div class="border border-ash/20 px-4">
							<AdminToggle
								label="Discoverable code"
								description="Visibility and discoverability remain separate."
								name="isDiscoverable"
								bind:checked={$createForm.isDiscoverable}
							/>
						</div>
					{/if}
					<AdminDateTimePicker
						label="Starts at"
						name="startsAt"
						bind:value={$createForm.startsAt}
						error={$createErrors.startsAt}
					/>
					<AdminDateTimePicker
						label="Expires at"
						name="expiresAt"
						bind:value={$createForm.expiresAt}
						error={$createErrors.expiresAt}
					/>
				</div>
				<div class="mt-5 flex justify-end">
					<AdminButton type="submit" disabled={$createSubmitting}
						>{$createSubmitting ? 'Creating…' : 'Create inactive promotion'}</AdminButton
					>
				</div>
			</AdminSection>
		</form>
	{/if}

	<form
		method="GET"
		class="mt-7 grid gap-3 border border-charcoal bg-charcoal/20 p-4 md:grid-cols-[1fr_220px_auto]"
	>
		<AdminInput
			label="Search"
			name="query"
			value={data.filters.query}
			placeholder="Name or public title"
		/>
		<AdminSelect label="Application" name="mode" value={data.filters.mode}
			><option value="">All</option><option value="code">Code</option><option value="automatic"
				>Automatic</option
			></AdminSelect
		>
		<AdminButton type="submit" variant="outline" class="self-end">Filter</AdminButton>
	</form>

	<div class="mt-4 grid gap-3">
		{#each data.promotions.items as promotion (promotion.id)}
			<details class="group border border-charcoal bg-charcoal/20">
				<summary class="flex cursor-pointer list-none items-center gap-4 p-4 md:p-5">
					<div class="grid h-12 w-12 shrink-0 place-items-center bg-charcoal text-volt">
						<BadgePercent size={20} />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="font-sans text-sm font-semibold text-bone">{promotion.name}</h2>
							<AdminBadge variant={statusTone(promotion.status)}>{promotion.status}</AdminBadge
							><AdminBadge>{promotion.applicationMode}</AdminBadge><AdminBadge
								>{promotion.visibility}</AdminBadge
							>
						</div>
						<p class="mt-1 font-mono text-[10px] tracking-widest text-ash uppercase">
							{promotion.discountType === 'fixed'
								? `LKR ${promotion.discountValue.toLocaleString()}`
								: `${promotion.discountValue}%`} · priority {promotion.priority} · {promotion.usedCount}/{promotion.usageLimit ??
								'∞'} used
						</p>
					</div>
					<ChevronDown size={18} class="text-ash transition-transform group-open:rotate-180" />
				</summary>
				<div class="border-t border-charcoal p-4 md:p-5">
					<div class="mb-4 flex justify-end">
						<form method="POST" action="?/setActive">
							<input type="hidden" name="promotionId" value={promotion.id} /><input
								type="hidden"
								name="isActive"
								value={promotion.isActive ? 'false' : 'true'}
							/><AdminButton
								type="submit"
								variant={promotion.isActive ? 'danger' : 'outline'}
								size="sm">{promotion.isActive ? 'Pause' : 'Activate'}</AdminButton
							>
						</form>
					</div>
					<div class="mb-5 grid gap-3 text-xs text-ash sm:grid-cols-2 lg:grid-cols-4">
						<p>Eligibility<br /><span class="text-bone">{promotion.eligibilityScope}</span></p>
						<p>
							Schedule<br /><span class="text-bone"
								>{promotion.startsAt?.toLocaleString() ?? 'Immediate'} → {promotion.expiresAt?.toLocaleString() ??
									'No expiry'}</span
							>
						</p>
						<p>Public copy<br /><span class="text-bone">{promotion.publicTitle ?? 'None'}</span></p>
						<p>
							Codes<br /><span class="text-bone"
								>{promotion.codes.map((item) => item.code).join(', ') || 'Automatic'}</span
							>
						</p>
					</div>
					<form method="POST" action="?/update" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						<input type="hidden" name="promotionId" value={promotion.id} />
						<AdminInput
							label="Internal name"
							name="name"
							value={promotion.name}
							required
						/><AdminInput label="Public title" name="publicTitle" value={promotion.publicTitle} />
						<div>
							<p class="mb-2 font-mono text-[9px] tracking-widest text-ash uppercase">
								Application
							</p>
							<p class="bg-ink border border-charcoal px-3 py-2.5 text-sm text-bone capitalize">
								{promotion.applicationMode}
							</p>
							<input type="hidden" name="applicationMode" value={promotion.applicationMode} />
						</div>
						<AdminSelect label="Discount type" name="discountType" value={promotion.discountType}
							><option value="fixed">Fixed LKR</option><option value="percentage">Percentage</option
							></AdminSelect
						><AdminInput
							label="Discount value"
							name="discountValue"
							type="number"
							min="1"
							value={promotion.discountValue}
						/><AdminInput
							label="Minimum order"
							name="minOrderAmount"
							type="number"
							min="0"
							value={promotion.minOrderAmount}
						/>
						<AdminInput
							label="Max discount"
							name="maxDiscountAmount"
							type="number"
							min="1"
							value={promotion.maxDiscountAmount}
						/><AdminInput
							label="Usage limit"
							name="usageLimit"
							type="number"
							min="1"
							value={promotion.usageLimit}
						/><AdminInput
							label="Per-customer limit"
							name="perUserLimit"
							type="number"
							min="1"
							value={promotion.perUserLimit}
						/>
						<AdminSelect
							label="Eligibility"
							name="eligibilityScope"
							value={promotion.eligibilityScope}
							><option value="all">All</option><option value="authenticated">Authenticated</option
							><option value="customer_grant">Customer grant</option></AdminSelect
						><AdminSelect label="Visibility" name="visibility" value={promotion.visibility}
							><option value="internal">Internal</option><option value="unlisted">Unlisted</option
							><option value="public">Public</option></AdminSelect
						><AdminInput
							label="Priority"
							name="priority"
							type="number"
							min="0"
							value={promotion.priority}
						/>
						<div class="lg:col-span-3">
							<AdminTextarea
								label="Internal note"
								name="internalDescription"
								value={promotion.internalDescription}
							/>
						</div>
						<div class="lg:col-span-3">
							<AdminTextarea
								label="Public description"
								name="publicDescription"
								value={promotion.publicDescription}
							/>
						</div>
						<input
							type="hidden"
							name="startsAt"
							value={promotion.startsAt?.getTime() ?? ''}
						/><input type="hidden" name="expiresAt" value={promotion.expiresAt?.getTime() ?? ''} />
						<div class="flex justify-end lg:col-span-3">
							<AdminButton type="submit" variant="outline">Save promotion</AdminButton>
						</div>
					</form>
					{#if promotion.applicationMode === 'code'}
						<div class="mt-6 border-t border-charcoal pt-5">
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">
								Redemption codes
							</p>
							<p class="mt-1 text-xs text-ash">
								Each code has its own channel, distribution, usage limit, and lifecycle.
							</p>
							<div class="mt-4 grid gap-4">
								{#each promotion.codes as code (code.id)}
									<form
										method="POST"
										action="?/updateCode"
										class="bg-ink/40 grid gap-3 border border-charcoal p-4 md:grid-cols-2 lg:grid-cols-3"
									>
										<input type="hidden" name="promoCodeId" value={code.id} />
										<AdminInput label="Code" name="code" value={code.code} required />
										<AdminSelect label="Distribution" name="distribution" value={code.distribution}
											><option value="private">Private</option><option value="public">Public</option
											><option value="influencer">Influencer</option><option value="internal"
												>Internal</option
											></AdminSelect
										><AdminSelect
											label="Channel"
											name="redemptionChannel"
											value={code.redemptionChannel}
											><option value="storefront">Storefront</option><option value="admin"
												>Admin</option
											><option value="both">Both</option></AdminSelect
										><AdminInput
											label="Partner reference"
											name="partnerReference"
											value={code.partnerReference}
										/><AdminInput
											label="Code usage limit"
											name="codeUsageLimit"
											type="number"
											min="1"
											value={code.usageLimit}
										/>
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
										<div class="flex items-end justify-end">
											<AdminButton type="submit" variant="outline">Save code</AdminButton>
										</div>
									</form>
								{/each}
							</div>
							<form
								method="POST"
								action="?/addCode"
								class="mt-4 grid gap-3 border border-dashed border-ash/20 p-4 md:grid-cols-2 lg:grid-cols-3"
							>
								<input type="hidden" name="promotionId" value={promotion.id} />
								<AdminInput label="New code" name="code" required />
								<AdminSelect label="Distribution" name="distribution" value="private"
									><option value="private">Private</option><option value="public">Public</option
									><option value="influencer">Influencer</option><option value="internal"
										>Internal</option
									></AdminSelect
								><AdminSelect label="Channel" name="redemptionChannel" value="storefront"
									><option value="storefront">Storefront</option><option value="admin">Admin</option
									><option value="both">Both</option></AdminSelect
								><AdminInput label="Partner reference" name="partnerReference" />
								<AdminInput label="Code usage limit" name="codeUsageLimit" type="number" min="1" />
								<div class="border border-ash/20 px-3">
									<AdminToggle label="Discoverable" name="isDiscoverable" checked={false} />
								</div>
								<div class="flex items-end justify-end lg:col-span-3">
									<AdminButton type="submit" variant="outline">Add code</AdminButton>
								</div>
							</form>
						</div>
					{/if}
					{#if promotion.eligibilityScope === 'customer_grant'}
						<div class="mt-6 border-t border-charcoal pt-5">
							<p class="font-mono text-[9px] tracking-widest text-ash uppercase">Customer grants</p>
							<form method="POST" action="?/grant" class="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
								<input type="hidden" name="promotionId" value={promotion.id} />
								<AdminInput label="Customer user ID" name="userId" required />
								<AdminButton type="submit" variant="outline" class="self-end"
									>Grant access</AdminButton
								>
							</form>
							<div class="mt-3 grid gap-2">
								{#each data.grants.filter((grant) => grant.promotionId === promotion.id) as grant (grant.id)}
									<div
										class="bg-ink flex flex-wrap items-center justify-between gap-3 border border-charcoal px-3 py-2"
									>
										<p class="font-mono text-[10px] text-bone">{grant.userId}</p>
										<form method="POST" action="?/revokeGrant">
											<input type="hidden" name="promotionId" value={promotion.id} />
											<input type="hidden" name="userId" value={grant.userId} />
											<AdminButton type="submit" variant="danger" size="sm">Revoke</AdminButton>
										</form>
									</div>
								{:else}
									<p class="border border-dashed border-ash/20 px-3 py-4 text-xs text-ash">
										No customers granted yet.
									</p>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</details>
		{:else}
			<div class="border border-dashed border-ash/20 px-6 py-16 text-center">
				<p class="font-display text-5xl text-bone uppercase">No promotions</p>
				<p class="mt-2 text-sm text-ash">Create an inactive promotion when policy allows.</p>
			</div>
		{/each}
	</div>

	<AdminSection
		title="Redemption audit"
		description="Append-only usage. Not generic CRUD."
		class="mt-8"
	>
		<div class="overflow-x-auto">
			<table class="w-full min-w-[720px] text-left text-xs">
				<thead class="font-mono text-[9px] tracking-widest text-ash uppercase"
					><tr
						><th class="p-3">Order</th><th class="p-3">Promotion</th><th class="p-3">Code</th><th
							class="p-3">Customer</th
						><th class="p-3">Discount</th><th class="p-3">Used</th></tr
					></thead
				><tbody
					>{#each data.usages.items as usage (usage.id)}<tr
							class="border-t border-charcoal text-bone"
							><td class="p-3 font-mono">{usage.orderId}</td><td class="p-3 font-mono"
								>{usage.promotionId}</td
							><td class="p-3">{usage.promoCode?.code ?? 'Automatic'}</td><td class="p-3"
								>{usage.userId ?? 'Guest'}</td
							><td class="p-3">LKR {usage.discountAmount.toLocaleString()}</td><td
								class="p-3 text-ash">{usage.usedAt.toLocaleString()}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
	</AdminSection>
</AdminPageShell>
