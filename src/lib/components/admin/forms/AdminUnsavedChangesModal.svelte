<script lang="ts">
	import { Save } from 'lucide-svelte';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import AdminButton from '../controls/AdminButton.svelte';

	let {
		isOpen = $bindable(false),
		title = 'Save before leaving?',
		description = 'You have unsaved changes. You can save your changes before leaving, or discard them.',
		saveLabel = 'Save changes',
		discardLabel = 'Discard changes',
		cancelLabel = 'Cancel',
		onsave,
		ondiscard,
		oncancel
	}: {
		isOpen: boolean;
		title?: string;
		description?: string;
		saveLabel?: string;
		discardLabel?: string;
		cancelLabel?: string;
		onsave: () => void;
		ondiscard: () => void;
		oncancel?: () => void;
	} = $props();
</script>

<Dialog.Root bind:open={isOpen}>
	{#if isOpen}
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
							class="w-full max-w-lg border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<Dialog.Title class="sr-only">Unsaved Changes</Dialog.Title>
							<Dialog.Description class="sr-only">
								Choose whether to save or discard your unsaved changes before leaving.
							</Dialog.Description>

							<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
								Unsaved Changes
							</p>
							<h2 class="mt-1 font-display text-3xl leading-none text-bone uppercase">
								{title}
							</h2>
							<p class="mt-3 font-sans text-sm leading-relaxed text-ash/80">
								{description}
							</p>
							<div class="mt-6 grid gap-3 sm:grid-cols-2">
								<AdminButton type="button" onclick={onsave} variant="volt">
									<Save size={14} aria-hidden="true" />
									{saveLabel}
								</AdminButton>
								<AdminButton type="button" onclick={ondiscard} variant="outline">
									{discardLabel}
								</AdminButton>
							</div>
							<AdminButton
								type="button"
								onclick={() => {
									isOpen = false;
									if (oncancel) oncancel();
								}}
								variant="outline"
								class="mt-3 w-full border-ash/15 bg-void/35 text-ash hover:text-bone"
							>
								{cancelLabel}
							</AdminButton>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
