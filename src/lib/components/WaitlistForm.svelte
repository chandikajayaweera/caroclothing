<script lang="ts">
	import { superForm, type SuperValidated, type Infer } from 'sveltekit-superforms';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { type WaitlistSchema } from '$lib/server/modules/waitlist/waitlist.zod';

	type Props = { data: SuperValidated<Infer<WaitlistSchema>> };
	let { data }: Props = $props();

	let isModalOpen = $state(false);
	let submitted = $state(false);
	let rawDigits = $state('');
	let touched = $state(false);
	let prefixFlashing = $state(false);
	let serverError = $state<string | null>(null);

	const SL_9_DIGIT = /^[1-9]\d{8}$/;

	let phoneError = $derived.by((): string => {
		if (serverError) return serverError;
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

	const { enhance, submitting, reset } = superForm(data, {
		onSubmit({ formData, cancel }) {
			touched = true;
			serverError = null;

			if (!isValid) {
				cancel();
				return;
			}
			formData.set('phone', '+94' + rawDigits);
		},

		onUpdated({ form }) {
			if (!form.posted) return;

			if (form.valid) {
				submitted = true;
				setTimeout(() => clearAndClose(), 3000);
				return;
			}

			const phoneErrors = form.errors.phone;
			if (phoneErrors && phoneErrors.length > 0) {
				serverError = phoneErrors[0];
			} else {
				serverError = 'Something went wrong. Please try again.';
			}
		},

		resetForm: false
	});

	function clearAndClose() {
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		isModalOpen = false;
		submitted = false;
		rawDigits = '';
		touched = false;
		prefixFlashing = false;
		serverError = null;
		reset();
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
		// Clear server error as soon as the user starts editing again.
		if (serverError) serverError = null;
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
			onclick={clearAndClose}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && clearAndClose()}
			aria-label="Close modal"
		></div>

		<div
			class="glass-card xs:max-w-[88%] relative z-10 w-full max-w-[92%] overflow-hidden rounded-2xl bg-white/90 p-4 shadow-2xl sm:max-w-md sm:p-6 md:p-8"
			style="max-height: 90dvh;"
			in:fly={{ y: 20, duration: 400, delay: 100, easing: cubicOut }}
		>
			<button
				class="absolute top-3 right-3 z-30 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-secondary/40 transition-colors hover:bg-primary/5 hover:text-primary sm:top-4 sm:right-4"
				onclick={clearAndClose}
				aria-label="Close"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- ── Form panel ──────────────────────────────────────────────── -->
			<div class="panel-transition">
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
		</div>
	</div>
{/if}

<style>
	button,
	input {
		touch-action: manipulation;
	}

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
