<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import AdminButton from '../controls/AdminButton.svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		kicker?: string;
		side?: 'left' | 'right';
		size?: 'sm' | 'md' | 'lg';
		bodyClass?: string;
		panelClass?: string;
		children: Snippet;
		footer?: Snippet;
		onOpenChange?: (open: boolean) => void;
	}

	let {
		open = $bindable(),
		title,
		description,
		kicker = 'Operations',
		side = 'right',
		size = 'md',
		bodyClass = '',
		panelClass = '',
		children,
		footer,
		onOpenChange
	}: Props = $props();

	const sideClasses = {
		left: 'inset-y-0 left-0 border-r',
		right: 'inset-y-0 right-0 border-l'
	};

	const sizeClasses = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-2xl'
	};

	function closeDrawer() {
		open = false;
		onOpenChange?.(false);
	}
</script>

<Dialog.Root bind:open {onOpenChange}>
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

			<Dialog.Content>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed {sideClasses[side]} z-50 flex h-full w-full {sizeClasses[
							size
						]} flex-col overflow-hidden border-charcoal bg-charcoal shadow-2xl outline-none {panelClass}"
					>
						<div
							class="flex shrink-0 items-center justify-between gap-3 border-b border-ash/10 p-4 sm:p-6"
						>
							<div class="min-w-0">
								<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
									{kicker}
								</p>
								<Dialog.Title
									class="mt-1 font-display text-2xl leading-none wrap-break-word text-bone uppercase sm:text-3xl"
								>
									{title}
								</Dialog.Title>
							</div>
							<AdminButton
								type="button"
								size="icon"
								variant="outline"
								onclick={closeDrawer}
								aria-label="Close drawer"
							>
								<X size={16} aria-hidden="true" />
							</AdminButton>
						</div>

						{#if description}
							<Dialog.Description class="sr-only">{description}</Dialog.Description>
						{:else}
							<Dialog.Description class="sr-only">{title} operations</Dialog.Description>
						{/if}

						<div
							class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-6 {bodyClass}"
						>
							{@render children()}
						</div>

						{#if footer}
							<div
								class="grid shrink-0 gap-2 border-t border-ash/10 bg-void/20 p-4 sm:flex sm:flex-wrap sm:justify-end sm:p-6"
							>
								{@render footer()}
							</div>
						{/if}
					</div>
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
