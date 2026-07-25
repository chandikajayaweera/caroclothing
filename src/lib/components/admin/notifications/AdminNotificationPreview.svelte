<script lang="ts">
	import { ExternalLink, Mail, MessageSquare } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/controls/AdminButton.svelte';

	interface Props {
		channel: string;
		type: string;
		payload: unknown;
		recipient: string;
		provider?: string | null;
	}

	let { channel, type, payload, recipient, provider = null }: Props = $props();

	type PreviewPayload = Record<string, unknown>;
	type Detail = { label: string; value: string };

	const values = $derived.by<PreviewPayload>(() =>
		payload && typeof payload === 'object' && !Array.isArray(payload)
			? (payload as PreviewPayload)
			: {}
	);

	function value(key: string, fallback = '--'): string {
		const candidate = values[key];
		if (candidate === null || candidate === undefined || candidate === '') return fallback;
		if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
		if (typeof candidate === 'boolean') return candidate ? 'Yes' : 'No';
		return fallback;
	}

	function safeHttpUrl(candidate: unknown): string | null {
		if (typeof candidate !== 'string') return null;
		try {
			const url = new URL(candidate);
			return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
		} catch {
			return null;
		}
	}

	const subject = $derived.by(() => {
		switch (type) {
			case 'auth_welcome':
				return 'Welcome to Caro Clothing';
			case 'auth_google_linked':
				return 'Google Account Linked';
			case 'order_confirmation':
				return `Order #${value('orderNumber', value('orderId'))} received`;
			case 'shipping_update':
				return `Order #${value('orderNumber', value('orderId'))} shipped`;
			case 'payment_update':
				return `Payment Update - Order #${value('orderNumber', value('orderId'))}`;
			case 'order_status_update':
				return `Order Status - #${value('orderNumber', value('orderId'))}`;
			default:
				return 'System Notification';
		}
	});

	const title = $derived.by(() => {
		switch (type) {
			case 'auth_welcome':
				return `Welcome to CARO, ${value('name', 'Customer')}`;
			case 'auth_google_linked':
				return 'Google account linked';
			case 'order_confirmation':
				return 'Order confirmed';
			case 'shipping_update':
				return 'Package on the way';
			case 'payment_update':
				return 'Payment updated';
			case 'order_status_update':
				return 'Order status updated';
			default:
				return 'Notification preview';
		}
	});

	const summary = $derived.by(() => {
		switch (type) {
			case 'auth_welcome':
				return 'Account created. Customer can now explore the catalog and manage their account.';
			case 'auth_google_linked':
				return 'Google sign-in was linked successfully to the CARO account.';
			case 'order_confirmation':
				return `Order #${value('orderNumber', value('orderId'))} was received and is being processed.`;
			case 'shipping_update':
				return `Order #${value('orderNumber', value('orderId'))} was handed to the delivery carrier.`;
			case 'payment_update':
				return `Payment state changed to ${value('statusLabel', value('status'))}.`;
			case 'order_status_update':
				return `Order state changed to ${value('statusLabel', value('status'))}.`;
			default:
				return value('message', 'No formatted template preview is available for this type.');
		}
	});

	const details = $derived.by<Detail[]>(() => {
		switch (type) {
			case 'auth_welcome':
			case 'auth_google_linked':
				return [{ label: 'Email', value: value('email', recipient) }];
			case 'order_confirmation':
				return [
					{ label: 'Order', value: value('orderNumber', value('orderId')) },
					{ label: 'Date', value: value('orderDate') },
					{ label: 'Total', value: value('total') },
					{ label: 'Shipping to', value: value('shippingAddress', 'Address snapshot') }
				];
			case 'shipping_update':
				return [
					{ label: 'Carrier', value: value('carrier', 'Standard courier') },
					{ label: 'Tracking no.', value: value('trackingNumber') },
					{ label: 'Est. delivery', value: value('estimatedDelivery') }
				];
			case 'payment_update':
				return [
					{ label: 'Order', value: value('orderNumber', value('orderId')) },
					{ label: 'Amount', value: value('amount') },
					{ label: 'Status', value: value('statusLabel', value('status')) }
				];
			case 'order_status_update':
				return [
					{ label: 'Order', value: value('orderNumber', value('orderId')) },
					{ label: 'Status', value: value('statusLabel', value('status')) }
				];
			default:
				return [];
		}
	});

	const trackingUrl = $derived(safeHttpUrl(values.trackingUrl));
	const smsText = $derived.by(() => {
		switch (type) {
			case 'order_confirmation': {
				const orderUrl = value('orderUrl', '');
				return `Order ${value('orderNumber', value('orderId'))} received. Total ${value('total')}.${orderUrl ? ` View ${orderUrl}` : ''}`;
			}
			case 'shipping_update': {
				const trackingUrl = value('trackingUrl', '');
				return `Order ${value('orderNumber', value('orderId'))} shipped. ${value('carrier', 'Courier')}. Tracking ${value('trackingNumber')}.${trackingUrl ? ` Track ${trackingUrl}` : ''}`;
			}
			case 'payment_update': {
				const paymentUrl = value('paymentUrl', '');
				return `Order ${value('orderNumber', value('orderId'))} payment ${value('statusLabel', value('status'))}. Amount ${value('amount')}.${paymentUrl ? ` View ${paymentUrl}` : ''}`;
			}
			case 'order_status_update': {
				const orderUrl = value('orderUrl', '');
				return `Order ${value('orderNumber', value('orderId'))} ${value('statusLabel', value('status'))}.${orderUrl ? ` View ${orderUrl}` : ''}`;
			}
			default:
				return value('message', 'No formatted SMS preview is available for this type.');
		}
	});
</script>

<section aria-label="Rendered notification preview">
	<p class="mb-3 font-mono text-[9px] tracking-[0.2em] text-ash/50 uppercase">Template preview</p>

	{#if channel === 'email'}
		<div class="overflow-hidden border border-charcoal bg-charcoal/10">
			<div
				class="space-y-2 border-b border-charcoal bg-charcoal/30 px-4 py-3 font-mono text-[10px]"
			>
				<div class="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
					<span class="text-ash/50">Subject</span>
					<span class="min-w-0 break-words text-bone">{subject}</span>
				</div>
				<div class="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
					<span class="text-ash/50">From</span>
					<span class="min-w-0 break-all text-ash">no-reply@caroclothing.lk</span>
				</div>
				<div class="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
					<span class="text-ash/50">To</span>
					<span class="min-w-0 break-all text-bone">{recipient}</span>
				</div>
			</div>

			<div class="bg-void p-3 sm:p-6">
				<div class="mx-auto max-w-md border border-charcoal/60 bg-charcoal/10 p-4 sm:p-5">
					<div
						class="mb-4 flex h-9 w-9 items-center justify-center border border-volt/30 bg-volt/5 text-volt"
					>
						<Mail size={17} aria-hidden="true" />
					</div>
					<h3 class="font-display text-xl leading-tight text-bone uppercase">{title}</h3>
					<p class="mt-3 font-sans text-sm leading-6 text-ash">{summary}</p>

					{#if details.length > 0}
						<dl class="mt-5 divide-y divide-charcoal border-y border-charcoal">
							{#each details as detail (detail.label)}
								<div class="grid gap-1 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
									<dt class="font-mono text-[9px] tracking-wider text-ash/50 uppercase">
										{detail.label}
									</dt>
									<dd class="min-w-0 font-sans text-xs break-words text-bone">{detail.value}</dd>
								</div>
							{/each}
						</dl>
					{/if}

					{#if trackingUrl}
						<AdminButton
							type="button"
							variant="outline"
							class="mt-5"
							onclick={() => window.open(trackingUrl, '_blank', 'noopener,noreferrer')}
						>
							Track shipment <ExternalLink size={13} aria-hidden="true" />
						</AdminButton>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<div
			class="flex flex-col items-center justify-center border border-charcoal bg-charcoal/10 p-3 sm:p-6"
		>
			<div class="w-full max-w-sm border border-charcoal bg-void p-4 shadow-xl">
				<div
					class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-charcoal/50 pb-3 font-mono text-[9px] text-ash/50"
				>
					<span class="inline-flex items-center gap-2">
						<MessageSquare size={13} aria-hidden="true" /> CARO SMS
					</span>
					<span>Sender: {provider || 'text.lk'}</span>
				</div>

				<div
					class="ml-auto max-w-[92%] bg-volt px-4 py-3 font-sans text-xs leading-relaxed font-medium break-words text-void sm:max-w-[85%]"
				>
					{smsText}
				</div>
				<p class="mt-3 text-right font-mono text-[8px] break-all text-ash/40">
					Recipient: {recipient}
				</p>
			</div>
		</div>
	{/if}
</section>
