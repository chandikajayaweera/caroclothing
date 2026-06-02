<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		ArrowLeft,
		Calendar,
		Edit,
		Trash2,
		ShoppingBag,
		Power,
		Users,
		AlertTriangle,
		Star,
		Mail,
		Phone,
		Info,
		CheckCircle2
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import type { ActionData, PageData } from './$types';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminDetailLayout from '$lib/components/admin/layout/AdminDetailLayout.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	const drop = $derived(data.drop);

	const {
		message: deleteDropMessage,
		enhance: deleteDropEnhance,
		submitting: deleteDropSubmitting
	} = superForm(initialForm(() => data.deleteDropForm));

	const {
		message: transitionDropStatusMessage,
		enhance: transitionDropStatusEnhance,
		submitting: transitionDropStatusSubmitting
	} = superForm(
		initialForm(() => data.transitionDropStatusForm),
		{
			resetForm: false
		}
	);

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	const dropActionMessage = $derived(
		actionData?.form?.message ?? $deleteDropMessage ?? $transitionDropStatusMessage
	);
	const dropActionMessageClass = $derived(
		page.status >= 400
			? 'border-red-400/30 bg-red-950/20 text-red-300'
			: 'border-volt/30 bg-volt/10 text-volt'
	);

	// Confirmation modal for "Go Live" status transition
	let showLaunchConfirm = $state(false);
	let transitionFormEl = $state<HTMLFormElement | null>(null);
	let submitToStatus = $state('');

	function handleTransitionClick(toStatus: 'teaser' | 'live' | 'sold_out' | 'archived') {
		submitToStatus = toStatus;
		if (toStatus === 'live') {
			showLaunchConfirm = true;
		} else {
			setTimeout(() => {
				if (transitionFormEl) transitionFormEl.requestSubmit();
			}, 0);
		}
	}

	function confirmLaunch() {
		showLaunchConfirm = false;
		setTimeout(() => {
			if (transitionFormEl) transitionFormEl.requestSubmit();
		}, 0);
	}

	// Countdown logic for teaser drops
	let countdownText = $state('Calculating...');
	let secondsLeft = $state(0);

	$effect(() => {
		if (drop.status !== 'teaser' || !drop.launchAt) return;

		const interval = setInterval(() => {
			const now = new Date().getTime();
			const launch = new Date(drop.launchAt!).getTime();
			const diff = launch - now;

			if (diff <= 0) {
				countdownText = 'LAUNCH TIME REVEALED';
				secondsLeft = 0;
				clearInterval(interval);
			} else {
				secondsLeft = Math.floor(diff / 1000);
				const days = Math.floor(secondsLeft / 86400);
				const hours = Math.floor((secondsLeft % 86400) / 3600);
				const minutes = Math.floor((secondsLeft % 3600) / 60);
				const secs = secondsLeft % 60;

				countdownText = `${days}D : ${hours.toString().padStart(2, '0')}H : ${minutes.toString().padStart(2, '0')}M : ${secs.toString().padStart(2, '0')}S`;
			}
		}, 1000);

		return () => clearInterval(interval);
	});

	function formatDateTime(date: Date | string | null | undefined): string {
		if (!date) return 'TBC';
		const d = new Date(date);
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getStatusClass(status: string): string {
		switch (status) {
			case 'live':
				return 'text-volt border border-volt/20 bg-volt/5';
			case 'teaser':
				return 'text-ash border border-ash/20 bg-ash/5';
			case 'sold_out':
				return 'text-red-400 border border-red-400/20 bg-red-400/5';
			case 'archived':
				return 'text-ash/60 border border-ash/10 bg-ash/5';
			default:
				return 'text-bone border border-charcoal bg-void';
		}
	}

	function getStatusLabel(status: string): string {
		return (status ?? '').replace('_', ' ');
	}

	function formatMoney(value: number | string | undefined | null): string {
		if (value === null || value === undefined) return 'LKR —';
		const parsed = typeof value === 'string' ? Number(value) : value;
		return `LKR ${parsed.toLocaleString('en-LK')}`;
	}

	function getProductPriceRange(product: any): string {
		if (!product.variants || product.variants.length === 0) return formatMoney(product.basePrice);
		const prices = product.variants.map((v: any) => v.basePrice);
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		return min === max ? formatMoney(min) : `${formatMoney(min)} - ${formatMoney(max)}`;
	}
</script>

<form
	method="POST"
	action="?/transitionDropStatus"
	bind:this={transitionFormEl}
	use:transitionDropStatusEnhance
	hidden
>
	<input type="hidden" name="dropId" value={drop.id} />
	<input type="hidden" name="toStatus" value={submitToStatus} />
</form>

<!-- Dialog for manual Live Launch confirmation -->
<Dialog.Root bind:open={showLaunchConfirm}>
	{#if showLaunchConfirm}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-50 bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-50 grid place-items-center px-4">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:scale={{ duration: 200, start: 0.95 }}
							class="w-full max-w-lg border border-red-500/20 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<Dialog.Title class="sr-only">Confirm Drop Launch</Dialog.Title>
							<Dialog.Description class="sr-only">
								Verify you wish to transition drop to Live status.
							</Dialog.Description>

							<div class="flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
								<AlertTriangle size={12} class="text-volt" />
								<span>DANGER ZONE / LAUNCH SIGNAL</span>
							</div>
							<h2 class="mt-2 font-display text-3xl leading-none text-bone uppercase">
								LAUNCH "{drop.name}" LIVE?
							</h2>
							<p class="mt-3 font-sans text-sm leading-relaxed text-ash/80">
								Are you sure you want to transition this drop to <strong class="text-volt uppercase">LIVE</strong>? This will instantly trigger the dispatch of notifications (SMS/Email) to all waitlist signups. The lineup products will go on sale immediately.
							</p>
							<div class="mt-6 grid gap-3 sm:grid-cols-2">
								<AdminButton type="button" onclick={confirmLaunch} variant="volt">
									<Power size={14} aria-hidden="true" />
									Confirm & Launch
								</AdminButton>
								<AdminButton type="button" onclick={() => showLaunchConfirm = false} variant="outline">
									Cancel
								</AdminButton>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<AdminDetailLayout
	kicker="Operations"
	title={drop.name}
	backHref={resolve('/app/drops')}
	backLabel="Back to drops"
	actionMessage={dropActionMessage}
	actionMessageClass={dropActionMessageClass}
>
	{#snippet headerActions()}
		<div class="flex items-center gap-3">
			<AdminButton
				href={resolve(`/app/drops/${drop.slug}/edit`)}
				variant="outline"
				size="md"
			>
				<Edit size={14} aria-hidden="true" />
				Edit Drop
			</AdminButton>

			<form method="POST" action="?/deleteDrop" use:deleteDropEnhance>
				<input type="hidden" name="dropId" value={drop.id} />
				<AdminButton
					type="submit"
					variant="outline"
					size="md"
					class="border-red-400/30 text-red-300 hover:bg-red-400 hover:text-void"
					disabled={$deleteDropSubmitting}
				>
					<Trash2 size={14} aria-hidden="true" />
					Delete
				</AdminButton>
			</form>
		</div>
	{/snippet}

	{#snippet mainContent()}
		<div class="space-y-6">
			<!-- Hero Banner display -->
			<div class="relative w-full border border-charcoal bg-void overflow-hidden">
				<div class="absolute inset-0 bg-gradient-to-t from-void to-transparent z-10"></div>
				<div class="aspect-[21/9] w-full flex items-center justify-center bg-charcoal/20">
					{#if drop.heroImageUrl}
						<img src={drop.heroImageUrl} alt="" class="h-full w-full object-cover" />
					{:else}
						<div class="flex flex-col items-center justify-center text-ash/30 p-8">
							<Calendar size={48} class="mb-2" />
							<span class="font-sans text-xs">No hero banner image assigned.</span>
						</div>
					{/if}
				</div>
				<div class="absolute bottom-6 left-6 right-6 z-20">
					{#if drop.tagline}
						<p class="font-mono text-xs tracking-[0.2em] text-volt uppercase leading-none mb-2">
							{drop.tagline}
						</p>
					{/if}
					<h2 class="font-display text-4xl leading-none text-bone uppercase">
						{drop.name}
					</h2>
				</div>
			</div>

			<!-- Teaser Story copy -->
			{#if drop.description}
				<AdminCard title="Description / Story Copy">
					<div class="p-5">
						<div class="prose prose-invert max-w-none font-sans text-sm text-ash/85 whitespace-pre-line">
							{drop.description}
						</div>
					</div>
				</AdminCard>
			{/if}

			<AdminCard title={`Lineup Products (${drop.products.length})`}>
				{#snippet headerActions()}
					{#if drop.products.length > 0}
						<AdminButton
							href={resolve(`/app/drops/${drop.slug}/edit?tab=lineup`)}
							variant="outline"
							size="sm"
						>
							Manage Lineup
						</AdminButton>
					{/if}
				{/snippet}
				<div class="p-5">
					<p class="font-sans text-xs text-ash/70 -mt-5 mb-4">
						Curated selection of limited-edition items assigned to this release.
					</p>

					{#if drop.products.length === 0}
						<div class="flex flex-col items-center justify-center border border-dashed border-charcoal p-10 text-center">
							<ShoppingBag size={24} class="text-ash/30 mb-2" />
							<p class="font-mono text-xs text-ash uppercase">Lineup is empty</p>
							<p class="font-sans text-xs text-ash/60 mt-1 max-w-sm">No products are assigned. To add products, click Edit Drop and go to the lineup tab.</p>
							<AdminButton href={resolve(`/app/drops/${drop.slug}/edit?tab=lineup`)} variant="outline" size="sm" class="mt-4">
								Manage Lineup
							</AdminButton>
						</div>
					{:else}
						<div class="grid gap-4 sm:grid-cols-2">
							{#each drop.products as item (item.productId)}
								{@const prod = item.product}
								<article class="border border-charcoal bg-void p-3 flex gap-3 relative min-w-0">
									{#if item.isHero}
										<div class="absolute -top-1.5 -left-1.5 bg-volt text-void px-2 py-0.5 font-mono text-[8px] font-bold tracking-widest uppercase flex items-center gap-1 shadow-md">
											<Star size={8} class="fill-current" />
											<span>Hero</span>
										</div>
									{/if}

									<div class="h-16 w-20 shrink-0 border border-charcoal bg-charcoal/20 overflow-hidden">
										{#if prod?.primaryImageUrl}
											<img src={prod.primaryImageUrl} alt="" class="h-full w-full object-cover" />
										{:else}
											<div class="h-full w-full bg-void flex items-center justify-center">
												<ShoppingBag size={16} class="text-ash/30" />
											</div>
										{/if}
									</div>

									<div class="min-w-0 flex-1 flex flex-col justify-between">
										<div>
											<div class="flex items-start justify-between gap-1.5">
												<h4 class="font-mono text-xs font-semibold text-bone uppercase truncate">
													{prod?.name || 'Unknown Product'}
												</h4>
												{#if prod}
													<span class="font-mono text-[9px] uppercase tracking-wider {prod.isActive ? 'text-volt' : 'text-red-300'}">
														{prod.isActive ? 'Active' : 'Inactive'}
													</span>
												{/if}
											</div>
											<p class="font-mono text-[9px] text-ash truncate mt-0.5">
												{prod?.slug || item.productId}
											</p>
										</div>
										<div class="mt-2 flex items-center justify-between border-t border-charcoal/30 pt-1.5 font-mono text-[10px]">
											<span class="text-ash">Price Range:</span>
											<span class="text-bone font-semibold">{prod ? getProductPriceRange(prod) : '—'}</span>
										</div>
									</div>
								</article>
							{/each}
						</div>
					{/if}
				</div>
			</AdminCard>
		</div>
	{/snippet}

	{#snippet sidebarContent()}
		<div class="space-y-6">
			<!-- Drop Status / Countdown controller -->
			<AdminCard title="Release Management">
				<div class="p-5 space-y-4">
					<div class="flex items-center justify-between border-b border-charcoal pb-4">
						<span class="font-mono text-xs text-ash">Active Status</span>
						<span class="rounded px-2.5 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase {getStatusClass(drop.status)}">
							{getStatusLabel(drop.status)}
						</span>
					</div>

					{#if drop.status === 'teaser' && drop.launchAt}
						<div class="border border-charcoal bg-void p-4 text-center">
							<p class="font-mono text-[8px] tracking-[0.25em] text-volt uppercase mb-1.5">
								RELEASE COUNTDOWN
							</p>
							<p class="font-display text-2xl text-bone tracking-widest leading-none">
								{countdownText}
							</p>
							<p class="font-mono text-[9px] text-ash mt-2">
								Launch target: {formatDateTime(drop.launchAt)}
							</p>
						</div>
					{/if}

					<!-- Operations milestones -->
					<div class="space-y-3 font-mono text-[10px]">
						<div class="flex items-center justify-between text-ash">
							<span>Launch target:</span>
							<span class="text-bone">{formatDateTime(drop.launchAt)}</span>
						</div>
						{#if drop.endAt}
							<div class="flex items-center justify-between text-ash">
								<span>Close window:</span>
								<span class="text-bone">{formatDateTime(drop.endAt)}</span>
							</div>
						{/if}
						<div class="flex items-center justify-between text-ash">
							<span>Last updated:</span>
							<span class="text-bone">{formatDateTime(drop.updatedAt)}</span>
						</div>
					</div>

					<!-- State actions buttons -->
					<div class="border-t border-charcoal/60 pt-4 space-y-2">
						{#if drop.status === 'teaser'}
							<AdminButton
								type="button"
								onclick={() => handleTransitionClick('live')}
								variant="volt"
								class="w-full justify-center"
								disabled={$transitionDropStatusSubmitting}
							>
								<Power size={14} />
								Force Launch Live
							</AdminButton>
							<AdminButton
								type="button"
								onclick={() => handleTransitionClick('archived')}
								variant="outline"
								class="w-full justify-center"
								disabled={$transitionDropStatusSubmitting}
							>
								Archive Teaser
							</AdminButton>
						{:else if drop.status === 'live'}
							<div class="flex gap-2">
								<AdminButton
									type="button"
									onclick={() => handleTransitionClick('sold_out')}
									variant="outline"
									class="flex-1 justify-center border-red-400/40 text-red-300 hover:bg-red-400 hover:text-void"
									disabled={$transitionDropStatusSubmitting}
								>
									Mark Sold Out
								</AdminButton>
								<AdminButton
									type="button"
									onclick={() => handleTransitionClick('archived')}
									variant="outline"
									class="flex-1 justify-center"
									disabled={$transitionDropStatusSubmitting}
								>
									Archive Drop
								</AdminButton>
							</div>
						{:else if drop.status === 'sold_out'}
							<AdminButton
								type="button"
								onclick={() => handleTransitionClick('archived')}
								variant="outline"
								class="w-full justify-center"
								disabled={$transitionDropStatusSubmitting}
							>
								Archive Record
							</AdminButton>
						{:else}
							<div class="flex items-center gap-2 p-3 bg-void/50 border border-charcoal text-ash/60">
								<Info size={14} />
								<span class="font-sans text-[11px]">This drop is archived and read-only.</span>
							</div>
						{/if}
					</div>
				</div>
			</AdminCard>

			<!-- Waitlist signup analytics -->
			<AdminCard title="Waitlist Registrations">
				<div class="p-5 space-y-4">
					{#await data.streamed.waitlist}
						<div class="animate-pulse space-y-3">
							<div class="h-8 bg-charcoal rounded w-1/3"></div>
							<div class="space-y-1.5">
								<div class="h-4 bg-charcoal rounded w-full"></div>
								<div class="h-4 bg-charcoal rounded w-5/6"></div>
							</div>
						</div>
					{:then waitlistResult}
						{@const waitlist = waitlistResult.items}
						{@const total = waitlistResult.total}
						{@const emailSignups = waitlist.filter((w) => w.contactType === 'email').length}
						{@const smsSignups = waitlist.filter((w) => w.contactType === 'phone').length}

						<div class="grid grid-cols-2 gap-3">
							<div class="border border-charcoal bg-void p-3 text-center">
								<p class="font-mono text-[9px] text-ash uppercase">EMAIL INTEREST</p>
								<p class="mt-1 font-display text-xl text-bone">{emailSignups}</p>
							</div>
							<div class="border border-charcoal bg-void p-3 text-center">
								<p class="font-mono text-[9px] text-ash uppercase">SMS INTEREST</p>
								<p class="mt-1 font-display text-xl text-bone">{smsSignups}</p>
							</div>
						</div>

						<div class="border-t border-charcoal/60 pt-4">
							<div class="flex items-center gap-2 font-mono text-[10px] text-volt uppercase mb-3">
								<Users size={12} />
								<span>Recent Signups ({total})</span>
							</div>

							{#if waitlist.length === 0}
								<p class="font-mono text-[10px] text-ash/50 py-2">No signups registered yet.</p>
							{:else}
								<div class="max-h-60 overflow-y-auto space-y-2 pr-1 font-mono text-[10px]">
									{#each waitlist as entry (entry.id)}
										<div class="border border-charcoal/40 bg-void p-2 flex items-center justify-between gap-3">
											<div class="min-w-0 flex items-center gap-2">
												{#if entry.contactType === 'email'}
													<Mail size={11} class="text-ash/60 shrink-0" />
												{:else}
													<Phone size={11} class="text-ash/60 shrink-0" />
												{/if}
												<span class="text-bone truncate">{entry.contact}</span>
											</div>
											<span class="shrink-0 text-right text-[8px] text-ash/40" title="Signed up time">
												{new Date(entry.createdAt).toLocaleDateString()}
											</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/await}
				</div>
			</AdminCard>
		</div>
	{/snippet}
</AdminDetailLayout>
