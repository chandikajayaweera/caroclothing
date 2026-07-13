<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import AdminButton from './AdminButton.svelte';

	let {
		open = $bindable(false),
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmVariant = 'danger',
		loading = false,
		onconfirm
	}: {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmVariant?: 'danger' | 'volt' | 'charcoal' | 'outline';
		loading?: boolean;
		onconfirm: () => void;
	} = $props();

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
							transition:scale={{ duration: 200, start: 0.95 }}
							class="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col gap-5 overflow-y-auto border border-ash/20 bg-charcoal p-4 shadow-2xl outline-none sm:p-6"
							aria-busy={loading}
						>
							<div class="border-b border-charcoal pb-4">
								<Dialog.Title class="font-display text-2xl text-bone uppercase">
									{title}
								</Dialog.Title>
							</div>

							<Dialog.Description class="font-sans text-sm leading-relaxed text-ash/90">
								{message}
							</Dialog.Description>

							<div class="grid gap-2 pt-2 sm:flex sm:items-center sm:justify-end sm:gap-3">
								<AdminButton onclick={() => (open = false)} variant="charcoal" disabled={loading}>
									{cancelLabel}
								</AdminButton>
								<AdminButton onclick={onconfirm} variant={confirmVariant} disabled={loading}>
									{#if loading}
										Processing...
									{:else}
										{confirmLabel}
									{/if}
								</AdminButton>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
