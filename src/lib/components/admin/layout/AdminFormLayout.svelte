<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArrowLeft } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';

	let {
		backHref,
		backLabel,
		kicker = 'Catalog',
		title,
		actionMessage,
		isSubmitting = false,
		submitLabel = 'Save',
		cancelLabel = 'Cancel',
		oncancel,
		mainContent,
		sidebarContent,
		mobilePanel,
		showSubmitButton = true
	}: {
		backHref: string;
		backLabel: string;
		kicker?: string;
		title: string;
		actionMessage?: string | null;
		isSubmitting?: boolean;
		submitLabel?: string;
		cancelLabel?: string;
		oncancel?: () => void;
		mainContent: Snippet;
		sidebarContent: Snippet;
		mobilePanel?: Snippet;
		showSubmitButton?: boolean;
	} = $props();
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
</svelte:head>

<section class="mx-auto max-w-7xl overflow-x-hidden px-2 pb-24 md:px-0 lg:pb-10">
	{#if isSubmitting}
		<div class="fixed top-0 right-0 left-0 z-50 h-[3px] bg-void">
			<div class="animate-progress-bar h-full bg-volt"></div>
		</div>
	{/if}
	<!-- Page Header -->
	<div class="border-b border-charcoal pb-4 md:pb-6">
		<a
			href={resolve(backHref as '/')}
			class="inline-flex min-h-11 items-center gap-2 font-mono text-[10px] tracking-widest text-ash uppercase hover:text-volt"
		>
			<ArrowLeft size={14} aria-hidden="true" />
			{backLabel}
		</a>

		<div class="mt-4 min-w-0">
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">{kicker}</p>
			<h1 class="mt-1 font-display text-4xl leading-none text-bone uppercase md:text-6xl">
				{title}
			</h1>
		</div>
	</div>

	<!-- Action Messages -->
	{#if actionMessage}
		<div class="mt-6">
			<p
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
		<aside class="min-w-0 lg:sticky lg:top-4 lg:self-start">
			<div
				class="flex flex-col overflow-hidden border border-ash/15 bg-charcoal lg:max-h-[calc(100vh-5rem)]"
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
				class="fixed right-0 bottom-0 left-0 z-40 border-t border-charcoal bg-void p-4 lg:hidden"
			>
				<div class="mx-auto flex max-w-7xl justify-end gap-3">
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
</section>

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
