<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toasts } from '$lib/client/stores/toast';
</script>

<div class="pointer-events-none fixed right-6 bottom-6 z-100 flex flex-col gap-3">
	{#each $toasts as toast (toast.id)}
		<div
			class="pointer-events-auto border border-ash/20 bg-charcoal px-5 py-3 font-mono text-[10px] tracking-widest uppercase shadow-xl"
			transition:fly={{ y: 20, duration: 250 }}
		>
			<span class={toast.type === 'error' ? 'text-red-500' : 'text-volt'}>
				{toast.message}
			</span>
		</div>
	{/each}
</div>
