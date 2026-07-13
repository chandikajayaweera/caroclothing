<script lang="ts">
	import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';

	let {
		title = 'Unable to load data',
		description = 'The admin view could not be loaded. Retry the request or return to the previous page.',
		retryLabel = 'Retry',
		backHref,
		backLabel = 'Go back',
		onretry,
		compact = false
	}: {
		title?: string;
		description?: string;
		retryLabel?: string;
		backHref?: string;
		backLabel?: string;
		onretry?: () => void;
		compact?: boolean;
	} = $props();
</script>

<div
	class="grid place-items-center border border-red-400/25 bg-red-950/10 px-4 text-center {compact
		? 'min-h-44 py-6'
		: 'min-h-72 py-10'}"
	role="alert"
>
	<div class="max-w-xl">
		<AlertTriangle class="mx-auto text-red-300" size={compact ? 22 : 28} aria-hidden="true" />
		<h2 class="mt-4 font-display text-2xl wrap-break-word text-bone uppercase sm:text-4xl">
			{title}
		</h2>
		<p class="mx-auto mt-2 max-w-lg font-sans text-sm leading-relaxed text-ash">{description}</p>
		{#if onretry || backHref}
			<div class="mt-6 flex flex-wrap justify-center gap-2">
				{#if onretry}
					<AdminButton type="button" variant="volt" onclick={onretry}>
						<RotateCw size={14} aria-hidden="true" />
						{retryLabel}
					</AdminButton>
				{/if}
				{#if backHref}
					<AdminButton href={backHref} variant="outline">
						<ArrowLeft size={14} aria-hidden="true" />
						{backLabel}
					</AdminButton>
				{/if}
			</div>
		{/if}
	</div>
</div>
