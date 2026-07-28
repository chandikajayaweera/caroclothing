<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();
</script>

<div class="skeleton-block {className}" aria-hidden="true"></div>

<style>
	.skeleton-block {
		position: relative;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-ash) 11%, transparent);
	}

	.skeleton-block::after {
		position: absolute;
		inset: 0;
		content: '';
		background: linear-gradient(
			100deg,
			transparent 18%,
			color-mix(in srgb, var(--color-bone) 8%, transparent) 48%,
			transparent 78%
		);
		transform: translate3d(-110%, 0, 0);
		animation: skeleton-sweep 1.35s ease-in-out infinite;
		will-change: transform;
	}

	@keyframes skeleton-sweep {
		to {
			transform: translate3d(110%, 0, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-block::after {
			animation: none;
			transform: none;
		}
	}
</style>
