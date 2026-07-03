<script lang="ts">
	let { count, class: className = '' }: { count: number; class?: string } = $props();

	let prevCount = 0;
	let animateBadge = $state(false);

	$effect(() => {
		if (count > prevCount && prevCount > 0) {
			animateBadge = true;
			const timer = setTimeout(() => {
				animateBadge = false;
			}, 600);
			return () => clearTimeout(timer);
		}
		prevCount = count;
	});
</script>

{#if count > 0}
	<span
		class="absolute flex h-4 w-4 items-center justify-center rounded-full bg-volt font-mono text-[9px] leading-none text-void transition-all duration-300 {className}"
		class:badge-bounce-anim={animateBadge}
	>
		{count}
	</span>
{/if}

<style>
	@keyframes badge-bounce {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.35);
			background-color: var(--color-volt);
		}
	}
	:global(.badge-bounce-anim) {
		animation: badge-bounce 0.6s ease-in-out;
	}
</style>
