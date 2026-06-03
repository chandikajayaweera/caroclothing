<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		children: Snippet;
		footer?: Snippet;
	}

	let { open = $bindable(), title, description, children, footer }: Props = $props();
</script>

<Dialog.Root bind:open>
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
						class="fixed inset-y-0 right-0 z-50 flex h-full w-full sm:max-w-lg flex-col justify-between overflow-y-auto border-l border-charcoal bg-charcoal p-6 shadow-2xl outline-none"
					>
						<div>
							<div class="flex items-center justify-between border-b border-ash/10 pb-4">
								<div>
									<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
										Operations
									</p>
									<Dialog.Title class="mt-1 font-display text-3xl leading-none text-bone uppercase">
										{title}
									</Dialog.Title>
								</div>
								<button
									type="button"
									onclick={() => (open = false)}
									class="text-ash/60 transition-colors hover:text-bone"
									aria-label="Close"
								>
									<X size={20} />
								</button>
							</div>

							{#if description}
								<Dialog.Description class="sr-only">
									{description}
								</Dialog.Description>
							{:else}
								<Dialog.Description class="sr-only">
									{title} operations
								</Dialog.Description>
							{/if}

							<div class="mt-6">
								{@render children()}
							</div>
						</div>

						{#if footer}
							<div class="mt-6 flex gap-3 border-t border-ash/10 pt-4">
								{@render footer()}
							</div>
						{/if}
					</div>
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
