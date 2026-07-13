<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { X } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import AdminButton from './AdminButton.svelte';

	let {
		open = $bindable(false),
		kicker,
		title,
		description,
		size = 'md', // 'sm' | 'md' | 'lg' | 'xl' | '2xl'
		onOpenChange,
		children
	}: {
		open: boolean;
		kicker?: string;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl';
		onOpenChange?: (open: boolean) => void;
		children: Snippet;
	} = $props();

	const sizeClasses = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-xl',
		'2xl': 'max-w-2xl',
		'5xl': 'max-w-5xl'
	};
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

			<div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-2 sm:p-4">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:scale={{ duration: 200, start: 0.95 }}
							class="flex max-h-[calc(100dvh-1rem)] w-full {sizeClasses[
								size
							]} flex-col gap-5 overflow-y-auto overscroll-contain border border-ash/20 bg-charcoal p-4 shadow-2xl outline-none sm:p-6"
						>
							<div class="flex items-start justify-between border-b border-charcoal pb-4">
								<div>
									{#if kicker}
										<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
											{kicker}
										</p>
									{/if}
									<Dialog.Title class="font-display text-2xl text-bone uppercase">
										{title}
									</Dialog.Title>
									<Dialog.Description class="sr-only">
										{description ?? title}
									</Dialog.Description>
								</div>
								<AdminButton
									type="button"
									size="icon"
									variant="outline"
									onclick={() => (open = false)}
									aria-label="Close modal"
								>
									<X size={14} aria-hidden="true" />
								</AdminButton>
							</div>

							{@render children()}
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
