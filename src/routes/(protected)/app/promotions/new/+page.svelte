<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { AlertTriangle, BadgePercent, CheckCircle2, TicketPercent } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { ActionData, PageData } from './$types';
	import AdminDateTimePicker from '$lib/components/admin/controls/AdminDateTimePicker.svelte';
	import AdminInput from '$lib/components/admin/controls/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/controls/AdminSelect.svelte';
	import AdminTextarea from '$lib/components/admin/controls/AdminTextarea.svelte';
	import AdminToggle from '$lib/components/admin/controls/AdminToggle.svelte';
	import AdminBadge from '$lib/components/admin/data-display/AdminBadge.svelte';
	import AdminCard from '$lib/components/admin/data-display/AdminCard.svelte';
	import AdminUnsavedChangesGuard from '$lib/components/admin/forms/AdminUnsavedChangesGuard.svelte';
	import AdminFormLayout from '$lib/components/admin/layout/AdminFormLayout.svelte';
	import { formatAdminDiscount } from '$lib/shared/admin/format';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const { form, errors, enhance, message, submitting, tainted } = superForm(
		initialForm(() => data.createForm),
		{ resetForm: false }
	);

	let formElement = $state<HTMLFormElement | null>(null);
	const actionMessage = $derived($message ?? actionData?.form?.message);
	const hasUnsavedChanges = $derived(Boolean($tainted));
	const warnings = $derived.by(() => {
		const items: string[] = [];
		if (!$form.name.trim()) items.push('Add an internal name');
		if ($form.applicationMode === 'code' && !$form.code?.trim()) {
			items.push('Add the initial redemption code');
		}
		if ($form.visibility === 'public' && !$form.publicTitle?.trim()) {
			items.push('Add a public title for public placement');
		}
		if ($form.startsAt && $form.expiresAt && $form.expiresAt <= $form.startsAt) {
			items.push('Expiry must follow the start time');
		}
		return items;
	});
</script>

<form method="POST" action="?/create" novalidate bind:this={formElement} use:enhance>
	<AdminFormLayout
		backHref="/app/promotions"
		backLabel="Back to promotions"
		kicker="Commerce"
		title="New Promotion"
		description="Define one discount policy. New promotions are always created inactive for a deliberate launch."
		{actionMessage}
		isSubmitting={$submitting}
		submitLabel="Create inactive promotion"
		mobileSidebarLabel="Promotion summary"
		oncancel={() => goto(resolve('/app/promotions'))}
	>
		{#snippet mainContent()}
			<AdminCard kicker="Step 1" title="Policy setup" border="border border-ash/15">
				<div class="mb-5 flex items-start gap-3 border border-volt/15 bg-volt/5 p-4">
					<BadgePercent size={20} class="mt-0.5 shrink-0 text-volt" aria-hidden="true" />
					<div class="min-w-0">
						<p class="font-sans text-sm font-semibold text-bone">Rule ownership</p>
						<p class="mt-1 text-xs leading-relaxed text-ash/70">
							The promotion owns discount policy. Codes only control redemption and distribution.
						</p>
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<AdminInput
						label="Internal name"
						name="name"
						bind:value={$form.name}
						error={$errors.name}
						placeholder="e.g. July drop launch"
						helpText="Used by the admin team."
						required
					/>
					<AdminInput
						label="Public title"
						name="publicTitle"
						bind:value={$form.publicTitle}
						error={$errors.publicTitle}
						placeholder="Midnight drop offer"
					/>
					<AdminSelect
						label="Application mode"
						name="applicationMode"
						bind:value={$form.applicationMode}
						error={$errors.applicationMode}
						helpText="This cannot be changed after creation."
						required
					>
						<option value="code">Redemption code</option>
						<option value="automatic">Automatic</option>
					</AdminSelect>
					<AdminSelect
						label="Discount type"
						name="discountType"
						bind:value={$form.discountType}
						error={$errors.discountType}
						required
					>
						<option value="fixed">Fixed LKR</option>
						<option value="percentage">Percentage</option>
					</AdminSelect>
				</div>
			</AdminCard>

			<AdminCard kicker="Step 2" title="Value and limits" border="border border-ash/15">
				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					<AdminInput
						label="Discount value"
						name="discountValue"
						type="number"
						min="1"
						bind:value={$form.discountValue}
						error={$errors.discountValue}
						required
					/>
					<AdminInput
						label="Minimum order"
						name="minOrderAmount"
						type="number"
						min="0"
						bind:value={$form.minOrderAmount}
						error={$errors.minOrderAmount}
						placeholder="No minimum"
					/>
					<AdminInput
						label="Maximum discount"
						name="maxDiscountAmount"
						type="number"
						min="1"
						bind:value={$form.maxDiscountAmount}
						error={$errors.maxDiscountAmount}
						placeholder="No cap"
					/>
					<AdminInput
						label="Overall usage limit"
						name="usageLimit"
						type="number"
						min="1"
						bind:value={$form.usageLimit}
						error={$errors.usageLimit}
						placeholder="Unlimited"
					/>
					<AdminInput
						label="Per-customer limit"
						name="perUserLimit"
						type="number"
						min="1"
						bind:value={$form.perUserLimit}
						error={$errors.perUserLimit}
						required
					/>
					<AdminInput
						label="Priority"
						name="priority"
						type="number"
						min="0"
						bind:value={$form.priority}
						error={$errors.priority}
						helpText="Higher automatic rules are evaluated first."
						required
					/>
				</div>
			</AdminCard>

			<AdminCard kicker="Step 3" title="Audience and placement" border="border border-ash/15">
				<div class="grid gap-4 sm:grid-cols-2">
					<AdminSelect
						label="Eligibility"
						name="eligibilityScope"
						bind:value={$form.eligibilityScope}
						error={$errors.eligibilityScope}
						required
					>
						<option value="all">All customers</option>
						<option value="authenticated">Signed-in customers</option>
						<option value="customer_grant">Granted customers</option>
					</AdminSelect>
					<AdminSelect
						label="Visibility"
						name="visibility"
						bind:value={$form.visibility}
						error={$errors.visibility}
						helpText="Visibility does not activate the promotion."
						required
					>
						<option value="internal">Internal</option>
						<option value="unlisted">Unlisted</option>
						<option value="public">Public placement eligible</option>
					</AdminSelect>
					<div class="sm:col-span-2">
						<AdminTextarea
							label="Internal note"
							name="internalDescription"
							bind:value={$form.internalDescription}
							error={$errors.internalDescription}
							placeholder="Campaign intent, approvals, or support context."
							rows={3}
						/>
					</div>
					<div class="sm:col-span-2">
						<AdminTextarea
							label="Public description"
							name="publicDescription"
							bind:value={$form.publicDescription}
							error={$errors.publicDescription}
							placeholder="Short customer-facing explanation."
							rows={3}
						/>
					</div>
				</div>
			</AdminCard>

			{#if $form.applicationMode === 'code'}
				<AdminCard kicker="Step 4" title="Initial redemption code" border="border border-ash/15">
					<div class="grid gap-4 sm:grid-cols-2">
						<AdminInput
							label="Code"
							name="code"
							bind:value={$form.code}
							error={$errors.code}
							placeholder="JULY25"
							helpText="Uppercase letters, numbers, underscores, and hyphens."
							required
						/>
						<AdminSelect
							label="Distribution"
							name="distribution"
							bind:value={$form.distribution}
							error={$errors.distribution}
							required
						>
							<option value="private">Private</option>
							<option value="public">Public</option>
							<option value="influencer">Influencer</option>
							<option value="internal">Internal</option>
						</AdminSelect>
						<AdminSelect
							label="Redemption channel"
							name="redemptionChannel"
							bind:value={$form.redemptionChannel}
							error={$errors.redemptionChannel}
							required
						>
							<option value="storefront">Storefront</option>
							<option value="admin">Admin</option>
							<option value="both">Both</option>
						</AdminSelect>
						<AdminInput
							label="Code usage limit"
							name="codeUsageLimit"
							type="number"
							min="1"
							bind:value={$form.codeUsageLimit}
							error={$errors.codeUsageLimit}
							placeholder="Inherit promotion limit"
						/>
						<AdminInput
							label="Partner reference"
							name="partnerReference"
							bind:value={$form.partnerReference}
							error={$errors.partnerReference}
							placeholder="Creator or campaign ID"
						/>
						<div class="border border-ash/20 px-4">
							<AdminToggle
								label="Discoverable code"
								description="Allow approved public discovery surfaces."
								name="isDiscoverable"
								bind:checked={$form.isDiscoverable}
							/>
						</div>
					</div>
				</AdminCard>
			{/if}

			<AdminCard
				kicker={$form.applicationMode === 'code' ? 'Step 5' : 'Step 4'}
				title="Publishing window"
				border="border border-ash/15"
			>
				<div class="mb-5 flex items-start gap-3 border border-charcoal bg-void/35 p-4">
					<AlertTriangle size={18} class="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
					<p class="text-xs leading-relaxed text-ash/75">
						Scheduling does not activate a rule. Create it, review it, then activate it from the
						management page.
					</p>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<AdminDateTimePicker
						label="Starts at"
						name="startsAt"
						bind:value={$form.startsAt}
						error={$errors.startsAt}
					/>
					<AdminDateTimePicker
						label="Expires at"
						name="expiresAt"
						bind:value={$form.expiresAt}
						error={$errors.expiresAt}
					/>
				</div>
			</AdminCard>
		{/snippet}

		{#snippet sidebarContent()}
			<div class="p-5">
				<div class="flex items-center justify-between gap-3">
					<p class="font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Draft summary</p>
					<AdminBadge variant="neutral">inactive</AdminBadge>
				</div>
				<div class="mt-5 grid place-items-center border border-volt/20 bg-volt/5 px-4 py-7">
					<TicketPercent size={26} class="text-volt" aria-hidden="true" />
					<p class="mt-3 font-display text-4xl leading-none text-bone uppercase">
						{formatAdminDiscount($form.discountType, $form.discountValue)}
					</p>
					<p class="mt-2 text-center text-xs text-ash/70">
						{$form.name || 'Untitled promotion'}
					</p>
				</div>

				<div class="mt-4 grid gap-2 font-mono text-[10px] uppercase">
					<div class="flex justify-between gap-3 border-b border-ash/10 py-2">
						<span class="text-ash/60">Application</span>
						<span class="text-bone">{$form.applicationMode}</span>
					</div>
					<div class="flex justify-between gap-3 border-b border-ash/10 py-2">
						<span class="text-ash/60">Eligibility</span>
						<span class="text-right text-bone">{$form.eligibilityScope.replaceAll('_', ' ')}</span>
					</div>
					<div class="flex justify-between gap-3 border-b border-ash/10 py-2">
						<span class="text-ash/60">Visibility</span>
						<span class="text-bone">{$form.visibility}</span>
					</div>
					<div class="flex justify-between gap-3 py-2">
						<span class="text-ash/60">Customer limit</span>
						<span class="text-bone">{$form.perUserLimit}</span>
					</div>
				</div>

				{#if warnings.length > 0}
					<div class="mt-4 border border-amber-300/20 bg-amber-300/5 p-3.5">
						<p class="font-mono text-[9px] tracking-wider text-amber-300 uppercase">
							Attention ({warnings.length})
						</p>
						<ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-ash/75">
							{#each warnings as warning (warning)}
								<li>{warning}</li>
							{/each}
						</ul>
					</div>
				{:else}
					<div
						class="mt-4 flex items-center gap-2 border border-volt/20 bg-volt/5 p-3 text-xs text-volt"
					>
						<CheckCircle2 size={14} class="shrink-0" aria-hidden="true" />
						Required setup complete.
					</div>
				{/if}
			</div>
		{/snippet}
	</AdminFormLayout>
</form>

<AdminUnsavedChangesGuard
	dirty={hasUnsavedChanges && !$submitting}
	title="Leave new promotion?"
	description="Promotion policy has not been saved."
	onsave={() => formElement?.requestSubmit()}
/>
