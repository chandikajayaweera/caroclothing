<script lang="ts">
	import { CalendarClock, Clock3, FileWarning, ShoppingBag, Tag, UserRound } from 'lucide-svelte';
	import type { AdminBagDTO, BagItemDTO } from '$lib/server/modules/bag';
	import { formatAdminDateTime, formatAdminMoney } from '$lib/shared/admin/format';
	import { bagItemAvailabilityVariant } from '$lib/shared/admin/status';
	import AdminBadge from './AdminBadge.svelte';
	import AdminMetaGrid from './AdminMetaGrid.svelte';
	import AdminSection from '../layout/AdminSection.svelte';

	let { bag }: { bag: AdminBagDTO } = $props();

	const bagExpired = $derived(Boolean(bag.expiresAt && new Date(bag.expiresAt) <= new Date()));
	const ownerLabel = $derived(bag.ownerType === 'user' ? 'Customer bag' : 'Guest bag');
	const lineCount = $derived(bag.items.length);

	function availabilityLabel(item: BagItemDTO): string {
		switch (item.availabilityStatus) {
			case 'available':
				return 'In stock';
			case 'backorder':
				return 'Backorder';
			case 'insufficient':
				return `Only ${item.availableQuantity ?? 0} available`;
			case 'reserved':
				return 'Temporarily unavailable';
			case 'untracked':
				return 'Stock untracked';
			default:
				return 'Unavailable';
		}
	}

	function checkoutVariant(status: AdminBagDTO['checkoutStatus']): 'info' | 'warning' | 'neutral' {
		if (status === 'active') return 'info';
		if (status === 'expired') return 'warning';
		return 'neutral';
	}
</script>

<div class="space-y-5">
	<div class="grid gap-px border border-charcoal bg-charcoal sm:grid-cols-3">
		<div class="bg-void/70 p-4">
			<div class="flex items-center gap-2 text-ash/55">
				<UserRound size={14} aria-hidden="true" />
				<p class="font-mono text-[8px] tracking-widest uppercase">Owner</p>
			</div>
			<p class="mt-2 font-mono text-xs font-bold text-bone uppercase">{ownerLabel}</p>
		</div>

		<div class="bg-void/70 p-4">
			<div class="flex items-center gap-2 text-ash/55">
				<CalendarClock size={14} aria-hidden="true" />
				<p class="font-mono text-[8px] tracking-widest uppercase">Bag expiry</p>
			</div>
			<p class="mt-2 font-mono text-xs font-bold {bagExpired ? 'text-red-300' : 'text-bone'}">
				{bag.expiresAt ? formatAdminDateTime(bag.expiresAt, 'Unknown') : 'Does not expire'}
			</p>
		</div>

		<div class="bg-void/70 p-4">
			<div class="flex items-center gap-2 text-ash/55">
				<Clock3 size={14} aria-hidden="true" />
				<p class="font-mono text-[8px] tracking-widest uppercase">Checkout</p>
			</div>
			<div class="mt-2">
				<AdminBadge variant={checkoutVariant(bag.checkoutStatus)} size="xs">
					{bag.checkoutStatus === 'active'
						? 'Validation active'
						: bag.checkoutStatus === 'expired'
							? 'Window expired'
							: 'Not in checkout'}
				</AdminBadge>
			</div>
		</div>
	</div>

	<AdminSection
		title="Bag contents"
		description={`${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ${bag.itemCount} ${bag.itemCount === 1 ? 'unit' : 'units'}`}
	>
		{#if bag.items.length > 0}
			<div class="divide-y divide-charcoal">
				{#each bag.items as item (item.id)}
					<article
						class="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[72px_minmax(0,1fr)_auto]"
					>
						{#if item.imageUrl}
							<img
								src={item.imageUrl}
								alt={item.productName || 'Bag product'}
								class="h-16 w-16 border border-charcoal bg-charcoal object-cover sm:h-18 sm:w-18"
							/>
						{:else}
							<div
								class="grid h-16 w-16 place-items-center border border-charcoal bg-charcoal text-ash/35 sm:h-18 sm:w-18"
								aria-hidden="true"
							>
								<ShoppingBag size={20} />
							</div>
						{/if}

						<div class="min-w-0">
							<h3 class="truncate font-sans text-sm font-semibold text-bone">
								{item.productName || 'Unknown product'}
							</h3>
							<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ash">
								{#if item.size}<span
										>Size <strong class="text-bone uppercase">{item.size}</strong></span
									>{/if}
								{#if item.color}
									<span class="inline-flex items-center gap-1.5">
										{#if item.colorHex}
											<span
												class="h-2.5 w-2.5 rounded-full border border-ash/30"
												style:background-color={item.colorHex}
												aria-hidden="true"
											></span>
										{/if}
										{item.color}
									</span>
								{/if}
								<span>Qty <strong class="text-bone">{item.quantity}</strong></span>
							</div>

							<div class="mt-2 flex flex-wrap gap-1.5">
								<AdminBadge variant={bagItemAvailabilityVariant(item.availabilityStatus)} size="xs">
									{availabilityLabel(item)}
								</AdminBadge>
								{#if item.priceChanged}
									<AdminBadge variant="accent" size="xs" class="gap-1">
										<FileWarning size={10} aria-hidden="true" />
										Price changed
									</AdminBadge>
								{/if}
							</div>
						</div>

						<div class="col-start-2 text-left sm:col-start-3 sm:row-start-1 sm:text-right">
							<p class="font-mono text-xs font-bold text-bone">
								{formatAdminMoney(item.lineTotal)}
							</p>
							<p class="mt-1 font-mono text-[9px] text-ash/60">
								{formatAdminMoney(item.unitPrice)} × {item.quantity}
							</p>
							{#if item.priceChanged && item.currentUnitPrice !== null}
								<p class="mt-1 font-mono text-[9px] text-amber-300">
									Now {formatAdminMoney(item.currentUnitPrice)} each
								</p>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<div class="py-6 text-center">
				<ShoppingBag size={24} class="mx-auto text-ash/25" aria-hidden="true" />
				<p class="mt-2 font-mono text-[9px] tracking-widest text-ash uppercase">Bag is empty</p>
			</div>
		{/if}
	</AdminSection>

	<AdminSection title="Value & promotion" description="Current bag pricing before shipping.">
		<div class="space-y-3 font-mono text-xs">
			<div class="flex items-center justify-between gap-4 text-ash">
				<span>Subtotal</span>
				<span class="text-bone">{formatAdminMoney(bag.subtotal)}</span>
			</div>

			<div class="flex items-start justify-between gap-4 text-ash">
				<span class="inline-flex items-center gap-2">
					<Tag size={13} aria-hidden="true" />
					Promotion
				</span>
				<div class="min-w-0 text-right">
					{#if bag.promoCode}
						<p class="font-bold text-volt">{bag.promoCode}</p>
						{#if bag.promotionName}
							<p class="mt-1 font-sans text-[10px] text-ash/60">{bag.promotionName}</p>
						{/if}
					{:else if bag.promotionName}
						<p class="font-sans text-xs text-bone">{bag.promotionName}</p>
						<p class="mt-1 text-[9px] text-ash/60 uppercase">Automatic</p>
					{:else}
						<span class="text-ash/55">None</span>
					{/if}
				</div>
			</div>

			{#if bag.discountAmount > 0}
				<div class="flex items-center justify-between gap-4 text-volt">
					<span>Discount</span>
					<span>− {formatAdminMoney(bag.discountAmount)}</span>
				</div>
			{/if}

			<div
				class="flex items-center justify-between gap-4 border-t border-ash/15 pt-3 text-sm font-bold text-bone"
			>
				<span>Bag total</span>
				<span class="text-volt">{formatAdminMoney(bag.totalBeforeShipping)}</span>
			</div>
		</div>
	</AdminSection>

	<AdminSection
		title="Checkout state"
		description="Checkout is a validation window, not a stock hold."
	>
		{#if bag.checkoutStatus === 'active'}
			<div class="border border-sky-400/25 bg-sky-400/5 p-4">
				<div class="flex items-center gap-2 text-sky-300">
					<Clock3 size={15} aria-hidden="true" />
					<p class="font-mono text-[9px] font-bold tracking-wider uppercase">
						Validation window active
					</p>
				</div>
				<AdminMetaGrid cols={2} class="mt-3">
					<div>
						<p class="text-ash/55">Started</p>
						<p class="mt-1 text-bone">{formatAdminDateTime(bag.checkoutStartedAt, 'Unknown')}</p>
					</div>
					<div>
						<p class="text-ash/55">Deadline</p>
						<p class="mt-1 text-sky-200">
							{formatAdminDateTime(bag.checkoutExpiresAt, 'Unknown')}
						</p>
					</div>
				</AdminMetaGrid>
			</div>
		{:else if bag.checkoutStatus === 'expired'}
			<div class="border border-amber-400/25 bg-amber-400/5 p-4">
				<p class="font-mono text-[9px] font-bold tracking-wider text-amber-300 uppercase">
					Validation window expired
				</p>
				<p class="mt-2 font-sans text-xs leading-relaxed text-ash">
					Window ended {formatAdminDateTime(bag.checkoutExpiresAt, 'at an unknown time')}. Bag items
					remain saved; no stock was held.
				</p>
			</div>
		{:else}
			<div class="border border-charcoal bg-void/40 p-4">
				<p class="font-sans text-sm text-bone">Customer has not started checkout.</p>
				<p class="mt-1 font-sans text-xs text-ash">
					Items remain editable and availability may change.
				</p>
			</div>
		{/if}
	</AdminSection>

	<p class="text-right font-mono text-[9px] text-ash/45">
		Last bag change: {formatAdminDateTime(bag.updatedAt, 'Unknown')}
	</p>
</div>
