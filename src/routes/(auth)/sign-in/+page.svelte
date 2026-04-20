<script lang="ts">
	import { authClient } from '$lib/client/modules/auth';
	import { parseAuthError, parseUnknownError } from '$lib/client/modules/auth/utils';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { z } from 'zod/v4';

	// ─── View state ──────────────────────────────────────────────────────────────
	type View = 'idle' | 'phone' | 'otp' | 'name-prompt';
	let view = $state<View>('idle');

	// ─── Form fields ─────────────────────────────────────────────────────────────
	/** Raw 9-digit local portion — the +94 prefix is added on submission. */
	let rawDigits = $state('');
	let otpCode = $state('');
	let displayName = $state('');

	// ─── Phone UX state ──────────────────────────────────────────────────────────
	let touched = $state(false);
	let prefixFlashing = $state(false);

	// ─── Async state ─────────────────────────────────────────────────────────────
	let loading = $state(false);
	let error = $state('');

	// ─── OTP resend cooldown ──────────────────────────────────────────────────────
	/** Seconds remaining before another OTP can be sent. 0 means ready. */
	let resendCooldown = $state(0);
	let cooldownTimer: ReturnType<typeof setInterval> | null = null;

	function startResendCooldown(seconds = 30) {
		resendCooldown = seconds;
		cooldownTimer = setInterval(() => {
			resendCooldown -= 1;
			if (resendCooldown <= 0) {
				resendCooldown = 0;
				if (cooldownTimer) clearInterval(cooldownTimer);
			}
		}, 1000);
	}

	// ─── Zod schemas ─────────────────────────────────────────────────────────────

	/**
	 * Sri Lankan local number: 9 digits, must not start with 0.
	 * The +94 prefix is prepended before calling the auth client.
	 */
	const SL_DIGITS_RE = /^[1-9]\d{8}$/;
	const rawDigitsSchema = z
		.string()
		.min(1, 'Phone number is required.')
		.regex(SL_DIGITS_RE, 'Invalid Sri Lankan number.');

	/** Six-digit numeric OTP. */
	const otpSchema = z
		.string()
		.trim()
		.min(1, 'Please enter the code we sent you.')
		.regex(/^\d{6}$/, 'The code must be exactly 6 digits.');

	// ─── Derived ─────────────────────────────────────────────────────────────────
	let isPhoneValid = $derived(SL_DIGITS_RE.test(rawDigits));

	let phoneError = $derived.by((): string => {
		if (!touched) return '';
		if (rawDigits.length === 0) return 'Phone number is required.';
		if (rawDigits.length < 9) {
			const rem = 9 - rawDigits.length;
			return `${rem} more digit${rem !== 1 ? 's' : ''} needed`;
		}
		if (!SL_DIGITS_RE.test(rawDigits)) return 'Invalid Sri Lankan number.';
		return '';
	});

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	function validate<T>(schema: z.ZodType<T>, value: unknown): string | null {
		const result = schema.safeParse(value);
		return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid input.');
	}

	function isNewUser(createdAt: string | Date): boolean {
		return Date.now() - new Date(createdAt).getTime() < 60_000;
	}

	interface MinimalUser {
		createdAt: string | Date;
		name?: string | null;
	}

	async function afterSignIn(user: MinimalUser) {
		if (isNewUser(user.createdAt)) {
			displayName = user.name?.trim() ?? '';
			view = 'name-prompt';
		} else {
			await goto('/');
		}
	}

	// ─── Phone input handling ─────────────────────────────────────────────────────

	function handlePhoneInput(e: Event) {
		const input = e.target as HTMLInputElement;
		let val = input.value.replace(/\D/g, '');
		if (val.startsWith('0')) {
			val = val.slice(1);
			flashPrefix();
		}
		rawDigits = val.slice(0, 9);
		input.value = rawDigits;
		if (error) error = '';
	}

	function flashPrefix() {
		prefixFlashing = false;
		requestAnimationFrame(() => {
			prefixFlashing = true;
			setTimeout(() => (prefixFlashing = false), 900);
		});
	}

	// ─── Mount ───────────────────────────────────────────────────────────────────

	onMount(async () => {
		// 1. Redirect already-authenticated users immediately.
		const { data: session } = await authClient.getSession();
		if (session?.user) {
			if (isNewUser(session.user.createdAt)) {
				displayName = session.user.name?.trim() ?? '';
				view = 'name-prompt';
			} else {
				await goto('/');
			}
			return;
		}

		// 2. Auto-trigger Google One Tap if the browser supports FedCM.
		//    This shows Google's native prompt overlay — no button required.
		//    A dismissed prompt rejects the promise; that is not an error.
		if ('IdentityCredential' in window) {
			try {
				await authClient.oneTap();
				const { data: newSession } = await authClient.getSession();
				if (newSession?.user) await afterSignIn(newSession.user);
			} catch {
				// User dismissed or browser blocked the prompt — fall through silently.
			}
		}
	});

	// ─── Google OAuth button ──────────────────────────────────────────────────────

	async function handleGoogleSignIn() {
		error = '';
		loading = true;
		try {
			await authClient.signIn.social({ provider: 'google', callbackURL: '/sign-in' });
		} catch (e) {
			error = parseUnknownError(e);
			loading = false;
		}
	}

	// ─── Phone: send OTP ─────────────────────────────────────────────────────────

	async function handleSendOtp() {
		touched = true;
		const validationError = validate(rawDigitsSchema, rawDigits);
		if (validationError) {
			error = validationError;
			return;
		}

		error = '';
		loading = true;
		try {
			const { error: err } = await authClient.phoneNumber.sendOtp({
				phoneNumber: '+94' + rawDigits
			});
			if (err) {
				error = parseAuthError(err);
				return;
			}
			otpCode = '';
			startResendCooldown(30);
			view = 'otp';
		} catch (e) {
			error = parseUnknownError(e);
		} finally {
			loading = false;
		}
	}

	async function handleResendOtp() {
		if (resendCooldown > 0) return;
		await handleSendOtp();
	}

	// ─── Phone: verify OTP ────────────────────────────────────────────────────────

	async function handleVerifyOtp() {
		const validationError = validate(otpSchema, otpCode);
		if (validationError) {
			error = validationError;
			return;
		}

		error = '';
		loading = true;
		try {
			const { data, error: err } = await authClient.phoneNumber.verify({
				phoneNumber: '+94' + rawDigits,
				code: otpCode.trim()
			});
			if (err) {
				error = parseAuthError(err);
				return;
			}
			if (data?.user) await afterSignIn(data.user);
		} catch (e) {
			error = parseUnknownError(e);
		} finally {
			loading = false;
		}
	}

	// ─── Name prompt ─────────────────────────────────────────────────────────────

	async function handleSaveName() {
		error = '';
		loading = true;
		try {
			const trimmed = displayName.trim();
			if (trimmed) {
				const { error: err } = await authClient.updateUser({ name: trimmed });
				if (err) {
					error = parseAuthError(err);
					return;
				}
			}
			await goto('/');
		} catch (e) {
			error = parseUnknownError(e);
		} finally {
			loading = false;
		}
	}

	async function handleSkipName() {
		await goto('/');
	}

	// ─── Prevent iOS zoom ─────────────────────────────────────────────────────────

	function preventIOSZoom(node: HTMLInputElement) {
		const viewportMeta = document.querySelector('meta[name="viewport"]');
		if (!viewportMeta) return;

		const originalContent = viewportMeta.getAttribute('content') ?? '';
		let timeoutId: ReturnType<typeof setTimeout>;

		const handleTouchStart = () => {
			clearTimeout(timeoutId);
			viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
		};

		const handleBlur = () => {
			timeoutId = setTimeout(() => {
				viewportMeta.setAttribute('content', originalContent);
			}, 300);
		};

		node.addEventListener('touchstart', handleTouchStart, { passive: true });
		node.addEventListener('blur', handleBlur);

		return {
			destroy() {
				clearTimeout(timeoutId);
				node.removeEventListener('touchstart', handleTouchStart);
				node.removeEventListener('blur', handleBlur);
			}
		};
	}

	// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

	function onPhoneKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleSendOtp();
	}

	function onOtpKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleVerifyOtp();
	}

	function onOtpInput() {
		if (/^\d{6}$/.test(otpCode.trim())) handleVerifyOtp();
	}
</script>

<svelte:head>
	<title>Sign In - Caro Clothing</title>
	<meta name="description" content="Sign in to your Caro Clothing account" />
	<meta name="keywords" content="Caro Clothing, Sign In, Login, Account" />
	<meta name="author" content="Caro Clothing" />
</svelte:head>

<div class="relative grid min-h-screen bg-background md:grid-cols-2">
	<!-- Left Side: Editorial Image -->
	<div class="relative hidden overflow-hidden bg-secondary md:block">
		<img
			src="https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=2071&auto=format&fit=crop"
			alt="Caro Clothing Editorial"
			class="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-[20s] ease-out hover:scale-105"
		/>
		<div class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent"></div>
		<div class="absolute bottom-16 left-16 z-10 text-white">
			<img
				src="/logo.png"
				alt="Caro Clothing"
				class="mb-6 h-16 w-auto object-contain brightness-0 invert md:h-20"
			/>
			<p class="max-w-md font-mono text-lg leading-relaxed font-light text-white/80">
				Elevated essentials for the modern wardrobe. Uncompromising quality.
			</p>
		</div>
	</div>

	<!-- Right Side: Authentication Flow -->
	<div
		class="relative flex flex-col items-center justify-center px-8 py-12 sm:px-16 md:py-0 lg:px-24"
	>
		<!-- Loading overlay -->
		{#if loading}
			<div
				aria-busy="true"
				aria-label="Loading"
				class="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
			>
				<svg
					class="h-8 w-8 animate-spin text-primary"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					/>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
					/>
				</svg>
			</div>
		{/if}

		<div class="mx-auto w-full max-w-sm">
			<!-- Mobile Brand Header -->
			<div class="mb-16 flex justify-center md:hidden">
				<img src="/logo.png" alt="Caro Clothing" class="h-16 w-auto object-contain" />
			</div>

			<!-- Dynamic Headers -->
			<div class="mb-10 space-y-3 text-center">
				{#if view === 'idle'}
					<h2 class="font-sans text-3xl font-medium tracking-tight">Sign In</h2>
					<p class="font-mono text-sm text-text/60">Log in or create an account to continue.</p>
				{:else if view === 'phone'}
					<h2 class="font-sans text-3xl font-medium tracking-tight">Via Phone</h2>
					<p class="font-mono text-sm text-text/60">We'll text you a verification code.</p>
				{:else if view === 'otp'}
					<h2 class="font-sans text-3xl font-medium tracking-tight">Verify Code</h2>
					<p class="font-mono text-sm text-text/60">
						Sent to <span class="font-medium text-text">+94{rawDigits}</span>
					</p>
				{:else if view === 'name-prompt'}
					<h2 class="font-sans text-3xl font-medium tracking-tight">Welcome</h2>
					<p class="font-mono text-sm text-text/60">Let's finish setting up your account.</p>
				{/if}
			</div>

			<!-- Global error banner (API / network errors) -->
			{#if error}
				<div
					role="alert"
					aria-live="assertive"
					class="mb-8 rounded border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700"
				>
					{error}
				</div>
			{/if}

			<!-- ── View: IDLE ─────────────────────────────────────────────── -->
			{#if view === 'idle'}
				<div class="flex flex-col gap-4">
					<button
						onclick={handleGoogleSignIn}
						disabled={loading}
						class="flex w-full items-center justify-center gap-3 rounded border border-border bg-background px-4 py-3.5 text-sm font-medium text-text transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					>
						<svg
							class="h-5 w-5"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
							aria-hidden="true"
						>
							<path
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
								fill="#4285F4"
							/>
							<path
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								fill="#34A853"
							/>
							<path
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
								fill="#FBBC05"
							/>
							<path
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
								fill="#EA4335"
							/>
						</svg>
						Continue with Google
					</button>

					<div class="relative my-4 flex items-center">
						<div class="grow border-t border-border"></div>
						<span class="mx-4 shrink text-xs font-medium tracking-widest text-text/30 uppercase"
							>Or</span
						>
						<div class="grow border-t border-border"></div>
					</div>

					<button
						onclick={() => {
							error = '';
							view = 'phone';
						}}
						disabled={loading}
						class="w-full rounded bg-primary px-4 py-3.5 text-sm font-medium text-cta-text transition-colors hover:bg-secondary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					>
						Continue with Phone Number
					</button>
				</div>
			{/if}

			<!-- ── View: PHONE ────────────────────────────────────────────── -->
			{#if view === 'phone'}
				<div class="flex flex-col gap-8">
					<div class="flex flex-col gap-1.5">
						<label for="phone" class="text-xs font-medium tracking-wider text-text/50 uppercase">
							Phone Number
						</label>

						<!-- Prefix badge + digit input -->
						<div
							class="flex w-full items-center overflow-hidden rounded border bg-transparent transition-all duration-200
								{phoneError
								? 'border-red-500 ring-4 ring-red-500/10'
								: rawDigits.length === 9 && isPhoneValid
									? 'border-green-500 ring-4 ring-green-500/10'
									: 'border-border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10'}"
						>
							<!-- +94 badge -->
							<span
								class="prefix-badge flex h-full items-center border-r px-3 py-3 font-mono text-sm font-semibold transition-colors duration-150 select-none
									{prefixFlashing ? 'prefix-flash' : ''}
									{phoneError ? 'border-red-300 text-red-500' : 'border-border text-text/50'}"
								aria-hidden="true"
							>
								+94
							</span>

							<input
								use:preventIOSZoom
								id="phone"
								type="tel"
								inputmode="numeric"
								placeholder="7X XXX XXXX"
								maxlength="9"
								autocomplete="tel-national"
								value={rawDigits}
								oninput={handlePhoneInput}
								onblur={() => (touched = true)}
								onkeydown={onPhoneKeydown}
								disabled={loading}
								class="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-sm outline-none placeholder:text-text/25 disabled:opacity-50"
							/>

							<!-- Trailing slot: digit counter or green check -->
							{#if rawDigits.length > 0 && rawDigits.length < 9}
								<span class="pr-3 font-mono text-xs text-text/30" aria-live="polite">
									{rawDigits.length}/9
								</span>
							{:else if rawDigits.length === 9 && isPhoneValid}
								<span class="pr-3 text-green-500" aria-label="Valid number">
									<svg
										class="h-4 w-4"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								</span>
							{/if}
						</div>

						<!-- Inline validation message -->
						{#if phoneError}
							<p class="ml-1 text-[11px] font-bold tracking-wide text-red-500 uppercase">
								{phoneError}
							</p>
						{/if}
					</div>

					<button
						onclick={handleSendOtp}
						disabled={loading || (touched && !isPhoneValid)}
						class="w-full rounded bg-primary px-4 py-3.5 text-sm font-medium text-cta-text transition-colors hover:bg-secondary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					>
						Send Code
					</button>

					<button
						onclick={() => {
							error = '';
							touched = false;
							view = 'idle';
						}}
						disabled={loading}
						class="mx-auto block text-sm font-medium text-text/50 transition-colors hover:text-text hover:underline"
					>
						Back to main
					</button>
				</div>
			{/if}

			<!-- ── View: OTP ──────────────────────────────────────────────── -->
			{#if view === 'otp'}
				<div class="flex flex-col gap-8">
					<div class="group relative mt-4 space-y-2">
						<input
							id="otp"
							type="tel"
							inputmode="numeric"
							autocomplete="one-time-code"
							maxlength="6"
							placeholder="• • • • • •"
							bind:value={otpCode}
							onkeydown={onOtpKeydown}
							oninput={onOtpInput}
							disabled={loading}
							class="peer w-full border-b border-border bg-transparent px-0 py-2 text-center text-3xl font-medium tracking-[0.5em] transition-colors placeholder:tracking-widest placeholder:text-text/20 focus:border-primary focus:outline-none disabled:opacity-50"
						/>
						<div
							class="absolute bottom-0 left-0 h-[2px] w-0 bg-primary transition-all duration-300 ease-out peer-focus:w-full"
						></div>
					</div>

					<button
						onclick={handleVerifyOtp}
						disabled={loading}
						class="w-full rounded bg-primary px-4 py-3.5 text-sm font-medium text-cta-text transition-colors hover:bg-secondary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					>
						Verify Account
					</button>

					<div class="flex items-center justify-between font-mono text-sm text-text/50">
						<button
							onclick={() => {
								error = '';
								view = 'phone';
							}}
							disabled={loading}
							class="transition-colors hover:text-text hover:underline"
						>
							Wrong number
						</button>
						<button
							onclick={handleResendOtp}
							disabled={loading || resendCooldown > 0}
							class="transition-colors hover:text-text hover:underline disabled:cursor-not-allowed disabled:opacity-40"
						>
							{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
						</button>
					</div>
				</div>
			{/if}

			<!-- ── View: NAME-PROMPT ──────────────────────────────────────── -->
			{#if view === 'name-prompt'}
				<div class="flex flex-col gap-8">
					<div class="group relative space-y-2">
						<label
							for="name"
							class="mb-1 block text-xs font-medium tracking-wider text-text/60 uppercase"
						>
							Your Name
						</label>
						<input
							id="name"
							type="text"
							autocomplete="name"
							placeholder="e.g. Amara"
							bind:value={displayName}
							disabled={loading}
							class="peer w-full border-b border-border bg-transparent px-0 py-2 text-lg font-medium transition-colors placeholder:text-text/20 focus:border-primary focus:outline-none disabled:opacity-50"
						/>
						<div
							class="absolute bottom-0 left-0 h-[2px] w-0 bg-primary transition-all duration-300 ease-out peer-focus:w-full"
						></div>
					</div>

					<button
						onclick={handleSaveName}
						disabled={loading}
						class="w-full rounded bg-primary px-4 py-3.5 text-sm font-medium text-cta-text transition-colors hover:bg-secondary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none disabled:opacity-50"
					>
						Continue
					</button>

					<button
						onclick={handleSkipName}
						disabled={loading}
						class="mx-auto block text-sm font-medium text-text/50 transition-colors hover:text-text hover:underline"
					>
						Skip for now
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

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
