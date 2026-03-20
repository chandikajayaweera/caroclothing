<script lang="ts">
	import { superForm, type SuperValidated, type Infer } from 'sveltekit-superforms';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { type WaitlistSchema } from '$lib/schemas/waitlist';

	// ── Types ──────────────────────────────────────────────────────────────────
	type Props = { data: SuperValidated<Infer<WaitlistSchema>> };
	let { data }: Props = $props();

	// ── Local state ────────────────────────────────────────────────────────────
	let isModalOpen = $state(false);
	let submitted = $state(false);
	let rawDigits = $state('');
	let touched = $state(false);
	let prefixFlashing = $state(false);
	let showExitPrompt = $state(false);

	// ── Validation ─────────────────────────────────────────────────────────────
	const SL_9_DIGIT = /^[1-9]\d{8}$/;

	let phoneError = $derived.by((): string => {
		if (!touched) return '';
		if (rawDigits.length === 0) return 'Number is required';
		if (rawDigits.length < 9) {
			const rem = 9 - rawDigits.length;
			return `${rem} more digit${rem !== 1 ? 's' : ''} needed`;
		}
		if (!SL_9_DIGIT.test(rawDigits)) return 'Invalid Sri Lankan number';
		return '';
	});

	let isValid = $derived(SL_9_DIGIT.test(rawDigits));

	// ── Superforms ─────────────────────────────────────────────────────────────
	const { enhance, submitting, reset } = superForm(data, {
		onSubmit({ formData, cancel }) {
			touched = true;
			if (!isValid) {
				cancel();
				return;
			}
			formData.set('phone', '+94' + rawDigits);
		},
		onResult({ result }) {
			if (result.type === 'success') {
				submitted = true;
				setTimeout(() => clearAndClose(), 3000);
			}
		},
		resetForm: false
	});

	// ── Close helpers ──────────────────────────────────────────────────────────
	function requestClose() {
		if (submitted) {
			clearAndClose();
			return;
		}
		showExitPrompt = true;
	}

	function clearAndClose() {
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		isModalOpen = false;
		showExitPrompt = false;
		submitted = false;
		rawDigits = '';
		touched = false;
		prefixFlashing = false;
		reset();
	}

	function dismissExitPrompt() {
		showExitPrompt = false;
	}

	// ── Input handler ─────────────────────────────────────────────────────────
	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		let val = input.value.replace(/\D/g, '');
		if (val.startsWith('0')) {
			val = val.slice(1);
			flashPrefix();
		}
		rawDigits = val.slice(0, 9);
		input.value = rawDigits;
	}

	function flashPrefix() {
		prefixFlashing = false;
		requestAnimationFrame(() => {
			prefixFlashing = true;
			setTimeout(() => (prefixFlashing = false), 900);
		});
	}
</script>

<!-- ── Trigger Button ──────────────────────────────────────────────────────── -->
<div
	in:fly={{ y: 20, duration: 800, delay: 500, easing: cubicOut }}
	class="mt-8 flex w-full justify-center px-4 md:mt-12"
>
	<button
		onclick={() => (isModalOpen = true)}
		class="group flex w-full min-w-[200px] cursor-pointer items-center justify-center gap-2 rounded-full border border-primary/20 bg-background/50 px-6 py-3 font-mono text-xs tracking-[0.15em] text-primary uppercase shadow-sm backdrop-blur-md transition-all duration-500 hover:bg-primary hover:tracking-[0.2em] hover:text-white hover:shadow-xl sm:w-auto md:gap-3 md:px-8 md:py-4 md:text-sm lg:text-base"
	>
		<svg
			class="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 md:h-5 md:w-5"
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
			/>
		</svg>
		Join Waitlist
	</button>
</div>

<!-- ── Modal ──────────────────────────────────────────────────────────────── -->
{#if isModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-primary/30 p-4 backdrop-blur-md"
		in:fade={{ duration: 300 }}
		out:fade={{ duration: 200 }}
	>
		<!-- Backdrop -->
		<div
			class="absolute inset-0 cursor-pointer"
			onclick={requestClose}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && requestClose()}
			aria-label="Close modal"
		></div>

		<!--
			Card: `relative` is the stacking context for both the X button
			and the exit-prompt overlay. `overflow-hidden` ensures the overlay
			(absolute inset-0) is clipped to the rounded corners.
			`max-h-[90dvh]` prevents the card from overflowing short viewports
			(e.g. iPhone 13 mini in landscape).
		-->
		<div
			class="glass-card xs:max-w-[88%] relative z-10 w-full max-w-[92%] overflow-hidden rounded-2xl bg-white/90 p-4 shadow-2xl sm:max-w-md sm:p-6 md:p-8"
			style="max-height: 90dvh;"
			in:fly={{ y: 20, duration: 400, delay: 100, easing: cubicOut }}
		>
			<!--
				X button — z-30 so it always floats above both the form panel
				and the exit-prompt overlay.
			-->
			<button
				class="absolute top-3 right-3 z-30 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-secondary/40 transition-colors hover:bg-primary/5 hover:text-primary sm:top-4 sm:right-4"
				onclick={() => (showExitPrompt ? clearAndClose() : requestClose())}
				aria-label="Close"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- ── Form panel (drives card height) ──────────────────────────── -->
			<div
				class="panel-transition"
				class:panel-hidden={showExitPrompt}
				aria-hidden={showExitPrompt}
			>
				<!-- Header -->
				<div class="mb-2 flex items-center gap-2.5 pt-1 pr-8 sm:gap-3">
					<svg
						class="h-5 w-5 shrink-0 text-[#25D366] sm:h-6 sm:w-6 md:h-7 md:w-7"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"
						/>
					</svg>
					<h3 class="text-base font-bold tracking-tight text-primary sm:text-xl md:text-2xl">
						Join the Waitlist
					</h3>
				</div>

				<p class="mb-3 text-xs text-secondary/70 sm:mb-5 sm:text-sm">
					Receive exclusive early access to drops via WhatsApp.
				</p>

				<!-- Form -->
				<form method="POST" use:enhance class="flex flex-col gap-3">
					<div class="flex w-full flex-col gap-1.5">
						<div
							class="flex w-full items-center overflow-hidden rounded-lg border bg-white/60 transition-all duration-300
								{phoneError
								? 'border-red-500 ring-4 ring-red-500/15'
								: rawDigits.length === 9 && isValid
									? 'border-green-500 ring-4 ring-green-500/10'
									: 'border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10'}"
						>
							<span
								class="prefix-badge flex h-full items-center border-r px-3 py-3 font-mono text-sm font-semibold transition-colors duration-150 select-none sm:text-base
									{prefixFlashing ? 'prefix-flash' : ''}
									{phoneError ? 'border-red-300 text-red-500' : 'border-border text-secondary/60'}"
								aria-hidden="true">+94</span
							>

							<input
								type="tel"
								inputmode="numeric"
								name="_phone_raw"
								value={rawDigits}
								oninput={handleInput}
								onblur={() => (touched = true)}
								placeholder="7X XXX XXXX"
								maxlength="9"
								autocomplete="tel-national"
								class="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-sm outline-none placeholder:text-secondary/30 sm:text-base"
							/>

							{#if rawDigits.length > 0 && rawDigits.length < 9}
								<span class="pr-3 font-mono text-xs text-secondary/30" aria-live="polite">
									{rawDigits.length}/9
								</span>
							{:else if rawDigits.length === 9 && isValid}
								<span class="pr-3 text-green-500" aria-label="Valid number">
									<svg
										class="h-4 w-4"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								</span>
							{/if}
						</div>

						<input type="hidden" name="phone" value="+94{rawDigits}" />

						{#if phoneError}
							<p
								class="ml-1 text-[11px] font-bold tracking-wide text-red-500 uppercase"
								in:fade={{ duration: 150 }}
							>
								{phoneError}
							</p>
						{/if}
					</div>

					<button
						type="submit"
						class="flex w-full cursor-pointer items-center justify-center rounded-lg bg-cta py-3 text-sm font-bold text-cta-text shadow-md transition-all duration-300 hover:bg-primary/95 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70 sm:py-3.5 sm:text-base md:py-4 md:text-lg"
						disabled={$submitting || submitted}
					>
						{#if submitted}
							<span class="flex items-center gap-2" in:fade>
								<svg
									class="h-5 w-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								Added Successfully
							</span>
						{:else if $submitting}
							<span class="flex items-center gap-2">
								<svg
									class="h-5 w-5 animate-spin"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									viewBox="0 0 24 24"
								>
									<circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
									<path d="M12 2a10 10 0 0 1 10 10" />
								</svg>
								Submitting...
							</span>
						{:else}
							Notify Me
						{/if}
					</button>
				</form>
			</div>

			<!--
				Exit-prompt overlay — `absolute inset-0` is now relative to
				the CARD (not panel-stack), so it covers the full card including
				its padding, with no bleed. `overflow-y-auto` handles edge cases
				where the card is very short (landscape on mini phones).
			-->
			<div
				class="panel-transition absolute inset-0 flex flex-col overflow-y-auto bg-white/90 p-4 sm:p-6 md:p-8"
				class:panel-hidden={!showExitPrompt}
				aria-hidden={!showExitPrompt}
			>
				<!-- Vertically centred content — top padding clears the X button -->
				<div
					class="flex flex-1 flex-col items-center justify-center gap-3 px-1 pt-8 pb-3 text-center sm:gap-4 sm:pt-10 sm:pb-4"
				>
					<!-- Warning icon -->
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500 sm:h-12 sm:w-12"
					>
						<svg
							class="h-5 w-5 sm:h-6 sm:w-6"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
							/>
						</svg>
					</div>

					<!-- Copy -->
					<div class="max-w-[240px] sm:max-w-xs">
						<h4 class="text-sm font-bold tracking-tight text-primary sm:text-base md:text-lg">
							Wait — don't miss out!
						</h4>
						<p class="mt-1.5 text-xs leading-relaxed text-secondary/70 sm:text-sm">
							Waitlist subscribers get an
							<span class="font-semibold text-primary">exclusive discount coupon</span>
							when we launch. Takes only 5 seconds to join. 🎁
						</p>
					</div>
				</div>

				<!-- Actions pinned to bottom -->
				<div class="flex flex-col gap-1">
					<button
						onclick={dismissExitPrompt}
						tabindex={showExitPrompt ? 0 : -1}
						class="w-full cursor-pointer rounded-lg bg-cta py-3 text-sm font-bold text-cta-text shadow-md transition-all duration-300 hover:bg-primary/95 hover:shadow-lg sm:py-3.5 sm:text-base"
					>
						Claim My Discount
					</button>
					<button
						onclick={clearAndClose}
						tabindex={showExitPrompt ? 0 : -1}
						class="w-full cursor-pointer rounded-lg py-2.5 text-xs text-secondary/50 transition-colors hover:text-secondary sm:text-sm"
					>
						No thanks, leave
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/*
	 * Panel stack: `relative` is the stacking context.
	 * Only the form panel lives here — exit prompt has been lifted
	 * to the card level so its `absolute inset-0` covers the full card.
	 */
	.panel-stack {
		position: relative;
	}

	.panel-transition {
		transition:
			opacity 260ms ease-in-out,
			transform 260ms ease-in-out;
		will-change: opacity, transform;
	}

	/* Hidden state: invisible, scaled back, non-interactive */
	.panel-hidden {
		opacity: 0;
		transform: scale(0.97);
		pointer-events: none;
		user-select: none;
	}

	/*
	 * Suppress iOS double-tap zoom + 300ms tap delay on all interactive
	 * elements. Combined with font-size ≥ 16px on the input this prevents
	 * viewport snapping on focus/blur on iPhone.
	 */
	button,
	input {
		touch-action: manipulation;
	}

	/* +94 flash when leading 0 is stripped */
	@keyframes prefixFlash {
		0% {
			background-color: transparent;
			color: inherit;
			transform: scale(1);
		}
		20% {
			background-color: #22c55e;
			color: #fff;
			transform: scale(1.08);
		}
		60% {
			background-color: #16a34a;
			color: #fff;
			transform: scale(1.05);
		}
		100% {
			background-color: transparent;
			color: inherit;
			transform: scale(1);
		}
	}

	.prefix-flash {
		animation: prefixFlash 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
		border-radius: 0;
	}
</style>
