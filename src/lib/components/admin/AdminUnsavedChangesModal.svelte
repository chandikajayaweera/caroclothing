<script lang="ts">
	import { Save } from 'lucide-svelte';
	import AdminButton from './AdminButton.svelte';

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

{#if isOpen}
	<div
		class="animate-fade-in fixed inset-0 z-50 grid place-items-center bg-void/85 px-4 backdrop-blur-sm"
	>
		<section class="w-full max-w-lg border border-ash/20 bg-charcoal p-6 shadow-2xl">
			<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Unsaved Changes</p>
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
		</section>
	</div>
{/if}
