<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import AdminButton from '../controls/AdminButton.svelte';

	let {
		open = $bindable(false),
		action,
		variantLabel,
		amount,
		physicalBefore,
		physicalAfter,
		reserved,
		availableAfter,
		note,
		loading = false,
		onconfirm
	}: {
		open: boolean;
		action: 'add' | 'remove';
		variantLabel: string;
		amount: number;
		physicalBefore: number;
		physicalAfter: number;
		reserved: number;
		availableAfter: number | null;
		note: string;
		loading?: boolean;
		onconfirm: () => void;
	} = $props();

	let isRemoval = $derived(action === 'remove');

	function handleOpenChange(nextOpen: boolean) {
		if (loading && !nextOpen) return;
		open = nextOpen;
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	{#if open}
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

			<div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-3 sm:p-4">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:scale={{ duration: 180, start: 0.96 }}
							class="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-y-auto border border-ash/20 bg-charcoal shadow-2xl outline-none"
							aria-busy={loading}
						>
							<header class="border-b border-ash/15 p-4 sm:p-6">
								<p class="font-mono text-[9px] font-bold tracking-widest text-volt uppercase">
									Inventory audit review
								</p>
								<Dialog.Title class="mt-2 font-display text-2xl text-bone uppercase sm:text-3xl">
									{isRemoval ? 'Remove stock' : 'Add stock'}
								</Dialog.Title>
								<Dialog.Description class="mt-2 font-sans text-sm leading-relaxed text-ash">
									Verify the movement before it is written to inventory history.
								</Dialog.Description>
							</header>

							<div class="space-y-4 p-4 sm:p-6">
								<div class="border border-ash/15 bg-void/40 p-3">
									<p class="font-mono text-[9px] tracking-wider text-ash uppercase">Variant</p>
									<p class="mt-1 font-sans text-sm font-semibold text-bone">{variantLabel}</p>
								</div>

								<div
									class="grid grid-cols-2 gap-px overflow-hidden border border-ash/15 bg-ash/15 sm:grid-cols-4"
								>
									<div class="bg-void p-3">
										<p class="font-mono text-[8px] text-ash uppercase">Before</p>
										<p class="mt-1 font-mono text-lg text-bone">{physicalBefore}</p>
									</div>
									<div class="bg-void p-3">
										<p class="font-mono text-[8px] text-ash uppercase">Movement</p>
										<p class="mt-1 font-mono text-lg {isRemoval ? 'text-red-300' : 'text-volt'}">
											{isRemoval ? '-' : '+'}{amount}
										</p>
									</div>
									<div class="bg-void p-3">
										<p class="font-mono text-[8px] text-ash uppercase">After</p>
										<p class="mt-1 font-mono text-lg text-bone">{physicalAfter}</p>
									</div>
									<div class="bg-void p-3">
										<p class="font-mono text-[8px] text-ash uppercase">Available</p>
										<p class="mt-1 font-mono text-lg text-volt">{availableAfter ?? 'Any'}</p>
									</div>
								</div>

								<p class="font-sans text-xs text-ash">
									{reserved} unit{reserved === 1 ? '' : 's'} remain reserved after this movement.
								</p>

								<div class="border border-ash/15 p-3">
									<p class="font-mono text-[9px] tracking-wider text-ash uppercase">Audit note</p>
									<p class="mt-2 font-sans text-sm whitespace-pre-wrap text-bone">
										{note || 'No note supplied.'}
									</p>
								</div>

								{#if isRemoval}
									<p
										class="border border-red-400/25 bg-red-400/5 p-3 font-sans text-xs text-red-200"
									>
										This reduces sellable stock and cannot be undone automatically.
									</p>
								{/if}
							</div>

							<footer class="grid gap-2 border-t border-ash/15 p-4 sm:flex sm:justify-end sm:p-6">
								<AdminButton onclick={() => (open = false)} variant="charcoal" disabled={loading}>
									Go back
								</AdminButton>
								<AdminButton
									onclick={onconfirm}
									variant={isRemoval ? 'danger' : 'volt'}
									disabled={loading}
								>
									{loading ? 'Applying...' : isRemoval ? 'Confirm removal' : 'Confirm addition'}
								</AdminButton>
							</footer>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
