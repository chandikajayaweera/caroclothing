<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminPageShell from './AdminPageShell.svelte';
	import AdminPageHeader from './AdminPageHeader.svelte';

	let {
		backHref,
		backLabel,
		kicker = 'Catalog',
		title,
		description,
		actionMessage,
		isSubmitting = false,
		submitLabel = 'Save',
		cancelLabel = 'Cancel',
		oncancel,
		mainContent,
		sidebarContent,
		mobilePanel,
		showSubmitButton = true,
		mobileSidebarLabel = 'Preview and status'
	}: {
		backHref: string;
		backLabel: string;
		kicker?: string;
		title: string;
		description?: string;
		actionMessage?: string | null;
		isSubmitting?: boolean;
		submitLabel?: string;
		cancelLabel?: string;
		oncancel?: () => void;
		mainContent: Snippet;
		sidebarContent: Snippet;
		mobilePanel?: Snippet;
		showSubmitButton?: boolean;
		mobileSidebarLabel?: string;
	} = $props();

	let mobileSidebarOpen = $state(false);
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
</svelte:head>

<AdminPageShell size="normal" spacing="normal" class="overflow-x-hidden">
	{#if isSubmitting}
		<div class="fixed top-0 right-0 left-0 z-50 h-[3px] bg-void">
			<div class="animate-progress-bar h-full bg-volt"></div>
		</div>
	{/if}
	<AdminPageHeader {kicker} {title} {description} {backHref} {backLabel} />

	<!-- Action Messages -->
	{#if actionMessage}
		<div class="mt-6">
			<p
				role="status"
				class="border border-volt/30 bg-volt/10 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
			>
				{actionMessage}
			</p>
		</div>
	{/if}

	<!-- Columns Layout Grid -->
	<div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
		<!-- Left Main Column -->
		<div class="grid min-w-0 gap-6">
			{@render mainContent()}
		</div>

		<!-- Right Sidebar Column — sticky, height-capped, scrollable content + pinned submit -->
		<aside class="order-first min-w-0 lg:sticky lg:top-4 lg:order-none lg:self-start">
			<button
				type="button"
				class="flex min-h-11 w-full items-center justify-between gap-3 border border-ash/20 bg-charcoal px-4 font-mono text-[10px] font-bold tracking-widest text-bone uppercase lg:hidden"
				aria-expanded={mobileSidebarOpen}
				onclick={() => (mobileSidebarOpen = !mobileSidebarOpen)}
			>
				<span>{mobileSidebarLabel}</span>
				<ChevronDown
					size={16}
					class="shrink-0 text-ash transition-transform {mobileSidebarOpen ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</button>
			<div
				class="{mobileSidebarOpen
					? 'flex'
					: 'hidden'} flex-col overflow-hidden border border-ash/15 bg-charcoal lg:flex lg:max-h-[calc(100vh-5rem)]"
			>
				<!-- Scrollable snapshot area -->
				<div class="min-h-0 flex-1 overflow-x-hidden lg:overflow-y-auto">
					{@render sidebarContent()}
				</div>

				<!-- Pinned submit footer — only visible at lg+ (mobile panel handles < lg) -->
				{#if showSubmitButton}
					<div class="hidden shrink-0 border-t border-ash/10 p-4 lg:block">
						<AdminButton
							type="submit"
							variant="volt"
							size="md"
							class="w-full"
							disabled={isSubmitting}
						>
							{isSubmitting ? 'Saving...' : submitLabel}
						</AdminButton>
					</div>
				{/if}
			</div>
		</aside>

		<!-- Mobile / Tablet Bottom Panel (< lg) -->
		{#if mobilePanel}
			{@render mobilePanel()}
		{:else if showSubmitButton}
			<div
				class="fixed right-0 bottom-0 left-0 z-40 border-t border-charcoal bg-void p-3 lg:hidden"
			>
				<div class="mx-auto grid max-w-7xl grid-cols-2 gap-2 sm:flex sm:justify-end sm:px-4">
					<AdminButton type="button" variant="charcoal" size="md" onclick={oncancel}>
						{cancelLabel}
					</AdminButton>
					<AdminButton type="submit" variant="volt" size="md" disabled={isSubmitting}>
						{isSubmitting ? 'Saving...' : submitLabel}
					</AdminButton>
				</div>
			</div>
		{/if}
	</div>
</AdminPageShell>

<style>
	@keyframes progress-slide {
		0% {
			left: -40%;
			width: 40%;
		}
		50% {
			width: 60%;
		}
		100% {
			left: 100%;
			width: 20%;
		}
	}
	.animate-progress-bar {
		position: absolute;
		height: 100%;
		animation: progress-slide 1.5s infinite linear;
	}
</style>
