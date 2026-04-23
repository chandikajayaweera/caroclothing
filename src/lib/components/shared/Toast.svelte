<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toasts } from '$lib/client/modules/stores/toast';
</script>

<div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
	{#each $toasts as toast (toast.id)}
		<div
			class="px-5 py-3 bg-charcoal border border-ash/20 font-mono text-[10px] uppercase tracking-widest pointer-events-auto shadow-xl"
			transition:fly={{ y: 20, duration: 250 }}
		>
			<span class={toast.type === 'error' ? 'text-red-500' : 'text-volt'}>
				{toast.message}
			</span>
		</div>
	{/each}
</div>
