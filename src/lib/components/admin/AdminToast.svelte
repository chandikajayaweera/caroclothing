<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { AlertCircle, CheckCircle, AlertTriangle, X } from 'lucide-svelte';

	type ToastType = 'error' | 'success' | 'warning';

	interface Props {
		message: string | null;
		type?: ToastType;
		duration?: number;
		onclose?: () => void;
	}

	let { message, type = 'error', duration = 5000, onclose }: Props = $props();

	// visible drives the DOM presence — toggled internally on dismiss
	let visible = $state(false);
	let timerId: ReturnType<typeof setTimeout> | null = null;

	// Whenever message changes, reset visibility + auto-dismiss timer
	$effect(() => {
		const msg = message;

		// Clear any in-flight timer
		if (timerId !== null) {
			clearTimeout(timerId);
			timerId = null;
		}

		if (msg && msg.trim().length > 0) {
			visible = true;

			if (duration > 0) {
				timerId = setTimeout(() => {
					dismiss();
				}, duration);
			}
		} else {
			visible = false;
		}

		return () => {
			if (timerId !== null) {
				clearTimeout(timerId);
				timerId = null;
			}
		};
	});

	function dismiss() {
		visible = false;
		onclose?.();
	}

	// Derived style map per type
	const variantClasses = $derived.by(() => {
		switch (type) {
			case 'success':
				return {
					wrapper: 'border-[#C8FF00]/30 bg-[#C8FF00]/10 text-[#C8FF00]',
					iconClass: 'text-[#C8FF00]',
					closeClass: 'text-[#C8FF00]/60 hover:text-[#C8FF00]'
				};
			case 'warning':
				return {
					wrapper: 'border-amber-300/20 bg-amber-900/20 text-amber-200',
					iconClass: 'text-amber-300',
					closeClass: 'text-amber-200/60 hover:text-amber-200'
				};
			case 'error':
			default:
				return {
					wrapper: 'border-red-400/30 bg-red-950/40 text-red-200',
					iconClass: 'text-red-400',
					closeClass: 'text-red-200/60 hover:text-red-200'
				};
		}
	});

	const ToastIcon = $derived(
		type === 'success' ? CheckCircle : type === 'warning' ? AlertTriangle : AlertCircle
	);
</script>

{#if visible && message}
	<!-- Backdrop anchor: fixed bottom-right desktop, bottom-center mobile -->
	<div
		class="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 sm:right-5 sm:bottom-5 sm:left-auto sm:translate-x-0"
		role="status"
		aria-live="polite"
		aria-atomic="true"
	>
		<div
			in:slide={{ duration: 240, axis: 'y' }}
			out:fade={{ duration: 180 }}
			class="
				relative flex w-[min(calc(100vw-2rem),380px)] min-w-[260px] items-start gap-3
				rounded-sm border px-4 py-3 shadow-2xl
				backdrop-blur-md
				{variantClasses.wrapper}
			"
		>
			<!-- Prefix icon -->
			<span class="mt-[1px] shrink-0 {variantClasses.iconClass}">
				<ToastIcon size={15} strokeWidth={2} />
			</span>

			<!-- Message -->
			<p class="flex-1 pr-4 font-mono text-[11px] leading-snug tracking-wide uppercase">
				{message}
			</p>

			<!-- Close button -->
			<button
				type="button"
				onclick={dismiss}
				aria-label="Dismiss notification"
				class="
					absolute top-2.5 right-2.5 shrink-0 rounded-sm p-0.5
					transition-colors duration-150
					{variantClasses.closeClass}
					focus-visible:ring-1 focus-visible:ring-current focus-visible:outline-none
				"
			>
				<X size={13} stroke-width={2.5} />
			</button>
		</div>
	</div>
{/if}
