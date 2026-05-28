<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Action } from 'svelte/action';
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
		enhanceAction,
		formElement = $bindable(),
		formAttrs = {},
		mainContent,
		sidebarContent,
		mobilePanel
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
		enhanceAction?: Action<HTMLFormElement, any>;
		formElement?: HTMLFormElement | null;
		formAttrs?: any;
		mainContent: Snippet;
		sidebarContent: Snippet;
		mobilePanel?: Snippet;
	} = $props();

	const noopAction = () => {};
	const activeEnhance = $derived(enhanceAction || noopAction);
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
</svelte:head>

<section class="mx-auto max-w-7xl overflow-x-hidden px-2 pb-24 md:px-0 lg:pb-10">
	<!-- Page Header -->
	<div class="border-b border-charcoal pb-4 md:pb-6">
		<a
			href={backHref}
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
	<form
		bind:this={formElement}
		{...formAttrs}
		use:activeEnhance
		class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
	>
		<!-- Left Main Column -->
		<div class="grid gap-6">
			{@render mainContent()}
		</div>

		<!-- Right Sidebar Column -->
		<aside class="grid gap-6 xl:sticky xl:top-8 xl:self-start">
			<div class="overflow-hidden border border-ash/15 bg-charcoal">
				{@render sidebarContent()}
			</div>
		</aside>

		<!-- Mobile Bottom Panel -->
		{#if mobilePanel}
			{@render mobilePanel()}
		{:else}
			<div
				class="fixed right-0 bottom-0 left-0 z-40 border-t border-charcoal bg-void p-4 sm:hidden"
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
	</form>
</section>
