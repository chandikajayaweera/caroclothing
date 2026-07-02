<script lang="ts">
	import { authClient } from '$lib/client/modules/auth';
	import {
		getAuthErrorRetryAfterSeconds,
		OTP_RATE_LIMITED_MESSAGE,
		parseAuthError,
		parseUnknownError
	} from '$lib/client/modules/auth/utils';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { getClientEnv } from '$lib/client/modules/env';
	import {
		MAX_DISPLAY_NAME_LENGTH,
		MIN_DISPLAY_NAME_LENGTH,
		isPhoneDerivedDisplayName,
		isValidDisplayName
	} from '$lib/shared/modules/auth-profile';

	type RedirectPath =
		| '/'
		| '/account'
		| '/account/addresses'
		| '/account/orders'
		| '/account/reviews'
		| '/account/security'
		| '/account/wishlist'
		| '/app'
		| '/bag'
		| '/checkout'
		| '/drops'
		| '/shop';

	const DEFAULT_REDIRECT_TO: RedirectPath = '/';
	const ALLOWED_REDIRECT_PATHS = new Set<string>([
		'/',
		'/account',
		'/account/addresses',
		'/account/orders',
		'/account/reviews',
		'/account/security',
		'/account/wishlist',
		'/app',
		'/bag',
		'/checkout',
		'/drops',
		'/shop'
	]);
	const PHONE_DIGITS_PATTERN = /^7\d{8}$/;
	const PHONE_EMAIL_DOMAIN = '@phone.caroclothing.lk';
	const env = getClientEnv();
	type RedirectTarget = {
		pathname: RedirectPath;
		suffix: string;
		href: string;
	};

	function getDefaultRedirectTarget(): RedirectTarget {
		return { pathname: DEFAULT_REDIRECT_TO, suffix: '', href: DEFAULT_REDIRECT_TO };
	}

	function getSafeRedirectTarget(value: string | null): RedirectTarget {
		if (!value || !value.startsWith('/') || value.startsWith('//'))
			return getDefaultRedirectTarget();

		let redirectUrl: URL;
		try {
			redirectUrl = new URL(value, env.PUBLIC_APP_URL);
		} catch {
			return getDefaultRedirectTarget();
		}

		const pathname = redirectUrl.pathname;
		if (!ALLOWED_REDIRECT_PATHS.has(pathname)) return getDefaultRedirectTarget();
		const suffix = `${redirectUrl.search}${redirectUrl.hash}`;
		return { pathname: pathname as RedirectPath, suffix, href: `${pathname}${suffix}` };
	}

	function getOtpCooldownSeconds(): number {
		return Math.max(1, Math.ceil(Number(env.PUBLIC_OTP_COOLDOWN_SECONDS) || 30));
	}

	const redirectTarget = $derived(getSafeRedirectTarget(page.url.searchParams.get('redirectTo')));
	const showRedirectNotice = $derived(redirectTarget.href !== DEFAULT_REDIRECT_TO);
	const session = authClient.useSession();

	// ─── View state ──────────────────────────────────────────────────────────────
	type View = 'idle' | 'phone' | 'otp' | 'name-prompt';
	let view = $state<View>('idle');

	// ─── Form fields ─────────────────────────────────────────────────────────────
	let rawDigits = $state('');
	let otpCode = $state('');
	let displayName = $state('');

	// ─── Async state ─────────────────────────────────────────────────────────────
	let loading = $state(false);
	let error = $state('');
	let errorCountdown = $state(0);

	// ─── OTP resend cooldown ──────────────────────────────────────────────────────
	let resendCooldown = $state(0);
	let cooldownTimer: ReturnType<typeof setInterval> | null = null;
	let errorTimer: ReturnType<typeof setInterval> | null = null;

	// ─── Phone glow state ─────────────────────────────────────────────────────────
	let showPhoneGlow = $state(false);
	let glowTimeout: ReturnType<typeof setTimeout> | null = null;

	function triggerPhoneGlow() {
		showPhoneGlow = true;
		if (glowTimeout) clearTimeout(glowTimeout);
		glowTimeout = setTimeout(() => {
			showPhoneGlow = false;
		}, 1000);
	}

	function stopErrorTimer() {
		if (!errorTimer) return;
		clearInterval(errorTimer);
		errorTimer = null;
	}

	function clearErrorMessage() {
		stopErrorTimer();
		error = '';
		errorCountdown = 0;
	}

	function setErrorMessage(message: string) {
		stopErrorTimer();
		error = message;
		errorCountdown = 0;
	}

	function setOtpCooldownError(seconds: number) {
		stopErrorTimer();
		error = OTP_RATE_LIMITED_MESSAGE;
		errorCountdown = Math.max(1, Math.ceil(seconds));
		errorTimer = setInterval(() => {
			errorCountdown -= 1;
			if (errorCountdown <= 0) {
				clearErrorMessage();
			}
		}, 1000);
	}

	function startResendCooldown(seconds = getOtpCooldownSeconds()) {
		resendCooldown = Math.max(1, Math.ceil(seconds));
		if (cooldownTimer) clearInterval(cooldownTimer);
		cooldownTimer = setInterval(() => {
			resendCooldown -= 1;
			if (resendCooldown <= 0) {
				resendCooldown = 0;
				if (cooldownTimer) {
					clearInterval(cooldownTimer);
					cooldownTimer = null;
				}
			}
		}, 1000);
	}

	onDestroy(() => {
		if (cooldownTimer) clearInterval(cooldownTimer);
		if (glowTimeout) clearTimeout(glowTimeout);
		stopErrorTimer();
	});

	// ─── Post-Login Effect ────────────────────────────────────────────────────────
	let redirecting = $state(false);

	$effect(() => {
		if ($session.data?.user && view !== 'name-prompt' && !redirecting) {
			redirecting = true;
			afterSignIn($session.data.user);
		}
	});

	// ─── Helpers ─────────────────────────────────────────────────────────────────
	function formatCountdown(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
	}

	async function afterSignIn(user: {
		createdAt: string | Date;
		email?: string | null;
		name?: string | null;
		phoneNumber?: string | null;
	}) {
		const hasPhoneAccount = Boolean(
			user.phoneNumber || user.email?.toLowerCase().endsWith(PHONE_EMAIL_DOMAIN)
		);

		if (hasPhoneAccount && isPhoneDerivedDisplayName(user.name, user.phoneNumber)) {
			displayName = '';
			view = 'name-prompt';
			redirecting = false;
		} else {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`${resolve(redirectTarget.pathname)}${redirectTarget.suffix}`);
		}
	}

	async function handleGoogleSignIn() {
		if (loading) return;
		clearErrorMessage();
		loading = true;
		try {
			const callbackURL =
				redirectTarget.href === DEFAULT_REDIRECT_TO
					? '/sign-in'
					: `/sign-in?redirectTo=${encodeURIComponent(redirectTarget.href)}`;

			const result = await authClient.signIn.social({ provider: 'google', callbackURL });
			if (result?.error) {
				setErrorMessage(parseAuthError(result.error));
				loading = false;
			}
		} catch (e) {
			setErrorMessage(parseUnknownError(e));
			loading = false;
		}
	}

	async function handleSendOtp() {
		if (loading) return;
		if (!PHONE_DIGITS_PATTERN.test(rawDigits)) {
			setErrorMessage('Enter a valid Sri Lankan mobile number (e.g. 7X XXX XXXX)');
			return;
		}
		clearErrorMessage();
		loading = true;
		try {
			const { error: err } = await authClient.phoneNumber.sendOtp({
				phoneNumber: '+94' + rawDigits
			});
			if (err) {
				const message = parseAuthError(err);
				if (message === OTP_RATE_LIMITED_MESSAGE) {
					const retryAfter = getAuthErrorRetryAfterSeconds(err) ?? getOtpCooldownSeconds();
					startResendCooldown(retryAfter);
					setOtpCooldownError(retryAfter);
					return;
				}

				if (err.code === 'ACCOUNT_SUSPENDED') {
					await goto(resolve('/auth/error?error=banned'));
					return;
				}

				setErrorMessage(message);
				return;
			}
			otpCode = '';
			startResendCooldown();
			view = 'otp';
		} catch (e) {
			setErrorMessage(parseUnknownError(e));
		} finally {
			loading = false;
		}
	}

	async function handleVerifyOtp() {
		if (loading || otpCode.length !== 6) return;
		clearErrorMessage();
		loading = true;
		try {
			const { data, error: err } = await authClient.phoneNumber.verify({
				phoneNumber: '+94' + rawDigits,
				code: otpCode.trim()
			});
			if (err) {
				if (err.code === 'ACCOUNT_SUSPENDED') {
					await goto(resolve('/auth/error?error=banned'));
					return;
				}
				setErrorMessage(parseAuthError(err));
				return;
			}
			if (data?.user) await afterSignIn(data.user);
		} catch (e) {
			setErrorMessage(parseUnknownError(e));
		} finally {
			loading = false;
		}
	}

	function handleOtpInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		otpCode = input.value.replace(/\D/g, '').slice(0, 6);
		input.value = otpCode;
		if (otpCode.length === 6) void handleVerifyOtp();
	}

	function handlePhoneInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		let digits = input.value.replace(/\D/g, '');

		if (digits.startsWith('0')) {
			digits = digits.slice(1);
			triggerPhoneGlow();
		}

		rawDigits = digits.slice(0, 9);
		input.value = rawDigits;
	}

	async function handleSaveName() {
		if (loading) return;
		clearErrorMessage();
		loading = true;
		try {
			const trimmed = displayName.trim();
			if (!isValidDisplayName(trimmed)) {
				setErrorMessage(
					`Enter your name using ${MIN_DISPLAY_NAME_LENGTH}-${MAX_DISPLAY_NAME_LENGTH} characters.`
				);
				return;
			}
			const { error: err } = await authClient.updateUser({ name: trimmed });
			if (err) {
				setErrorMessage(parseAuthError(err));
				return;
			}
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`${resolve(redirectTarget.pathname)}${redirectTarget.suffix}`);
		} catch (e) {
			setErrorMessage(parseUnknownError(e));
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In | Caro Clothing</title>
	<meta name="description" content="Sign in to your Caro Clothing account" />
</svelte:head>

<div class="relative grid min-h-screen overflow-hidden bg-void md:grid-cols-2">
	<!-- Left Side: Editorial Image -->
	<div class="relative hidden overflow-hidden border-r border-charcoal md:block">
		<img
			src="/images/editorial.jpg"
			alt="Caro Clothing Editorial"
			class="absolute inset-0 h-full w-full object-cover opacity-50 grayscale"
		/>
		<div class="absolute inset-0 bg-void/40"></div>
		<div class="absolute bottom-20 left-20 z-10 max-w-md">
			<h1 class="font-bebas mb-8 text-8xl leading-none tracking-tighter text-bone">
				THE NEXT<br />GEN.
			</h1>
			<p class="font-mono text-xs leading-relaxed tracking-[0.3em] text-ash/80 uppercase">
				Join the inner circle. Get early access to limited drops. Raw style. No suggestions.
			</p>
		</div>
	</div>

	<!-- Right Side: Authentication Flow -->
	<div class="relative flex flex-col items-center justify-center px-6 sm:px-12 lg:px-24">
		<div class="mx-auto w-full max-w-sm space-y-12">
			<!-- Header -->
			<div class="space-y-4 text-center">
				<a href={resolve('/')} class="font-bebas text-4xl tracking-[0.2em] text-bone">CARO</a>
				{#if view === 'idle'}
					<h2 class="font-bebas text-5xl tracking-tight text-bone uppercase">Access</h2>
				{:else if view === 'phone'}
					<h2 class="font-bebas text-5xl tracking-tight text-bone uppercase">Phone</h2>
				{:else if view === 'otp'}
					<h2 class="font-bebas text-5xl tracking-tight text-bone uppercase">Verify</h2>
				{:else if view === 'name-prompt'}
					<h2 class="font-bebas text-5xl tracking-tight text-bone uppercase">Welcome</h2>
				{/if}
			</div>

			{#if showRedirectNotice}
				<div class="border border-volt/20 bg-volt/10 p-4 text-center" role="status">
					<p class="font-mono text-[10px] font-bold tracking-widest text-volt">
						After sign in, you will be redirected to
						<span class="break-all">{redirectTarget.href}</span>.
					</p>
				</div>
			{/if}

			{#if error}
				<div class="border border-red-500/20 bg-red-500/10 p-4 text-center" role="alert">
					<p class="font-mono text-[10px] font-bold tracking-widest text-red-500 uppercase">
						{error}
					</p>
					{#if errorCountdown > 0}
						<p class="mt-2 font-mono text-xs font-bold tracking-widest text-red-500">
							{formatCountdown(errorCountdown)}
						</p>
					{/if}
				</div>
			{/if}

			<!-- IDLE VIEW -->
			{#if view === 'idle'}
				<div class="space-y-4">
					<button
						type="button"
						onclick={handleGoogleSignIn}
						disabled={loading}
						class="flex w-full items-center justify-center gap-4 border border-charcoal bg-charcoal py-5 font-mono text-[10px] tracking-[0.2em] text-bone uppercase transition-all hover:border-volt disabled:opacity-50"
					>
						<svg class="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
						Google
					</button>

					<div class="relative flex items-center py-6">
						<div class="grow border-t border-charcoal"></div>
						<span class="mx-4 font-mono text-[10px] tracking-widest text-ash/30 uppercase">OR</span>
						<div class="grow border-t border-charcoal"></div>
					</div>

					<Button
						variant="primary"
						class="h-16 w-full text-xl shadow-[0_0_20px_-5px_rgba(200,255,0,0.3)]"
						onclick={() => (view = 'phone')}
						disabled={loading}
					>
						Phone Number
					</Button>
				</div>
			{/if}

			<!-- PHONE VIEW -->
			{#if view === 'phone'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						if (!loading && rawDigits.length === 9) {
							void handleSendOtp();
						}
					}}
					class="space-y-8"
				>
					<div class="space-y-4">
						<label
							for="phone-input"
							class="font-mono text-[10px] tracking-widest text-ash uppercase">Your Number</label
						>
						<div
							class="flex items-center border-b-2 border-charcoal py-2 transition-colors focus-within:border-volt"
						>
							<span
								class="mr-4 font-mono text-xl transition-all duration-300 {showPhoneGlow
									? 'scale-110 font-bold text-volt drop-shadow-[0_0_8px_#C8FF00]'
									: 'text-ash'}"
							>
								+94
							</span>
							<input
								id="phone-input"
								type="tel"
								inputmode="numeric"
								autocomplete="tel-national"
								placeholder="7X XXX XXXX"
								maxlength="9"
								bind:value={rawDigits}
								oninput={handlePhoneInput}
								class="w-full border-none bg-transparent p-0 font-mono text-xl tracking-widest text-bone focus:ring-0"
							/>
						</div>
					</div>

					<Button
						type="submit"
						variant="primary"
						class="h-16 w-full text-xl"
						disabled={loading || rawDigits.length < 9}
					>
						Send Code
					</Button>

					<button
						type="button"
						onclick={() => (view = 'idle')}
						class="w-full text-center font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:text-bone"
					>
						Cancel
					</button>
				</form>
			{/if}

			<!-- OTP VIEW -->
			{#if view === 'otp'}
				<div class="space-y-10">
					<div class="space-y-4 text-center">
						<label for="otp-input" class="font-mono text-[10px] tracking-widest text-ash uppercase"
							>6-Digit Code</label
						>
						<input
							id="otp-input"
							type="tel"
							inputmode="numeric"
							autocomplete="one-time-code"
							maxlength="6"
							placeholder="000000"
							bind:value={otpCode}
							oninput={handleOtpInput}
							class="w-full border-none bg-transparent p-0 text-center font-mono text-5xl tracking-[0.3em] text-bone placeholder:text-charcoal focus:ring-0"
						/>
					</div>

					<div class="flex justify-between font-mono text-[10px] tracking-widest uppercase">
						<button onclick={() => (view = 'phone')} class="text-ash hover:text-bone">
							Wrong Number?
						</button>
						<button
							onclick={handleSendOtp}
							disabled={resendCooldown > 0 || loading}
							class="text-ash transition-colors hover:text-bone disabled:cursor-not-allowed disabled:opacity-30"
						>
							{resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend'}
						</button>
					</div>

					<Button
						variant="primary"
						class="h-16 w-full text-xl"
						onclick={handleVerifyOtp}
						disabled={loading || otpCode.length < 6}
					>
						Verify Code
					</Button>
				</div>
			{/if}

			<!-- NAME PROMPT VIEW -->
			{#if view === 'name-prompt'}
				<div class="space-y-10">
					<div class="space-y-4">
						<label for="name-input" class="font-mono text-[10px] tracking-widest text-ash uppercase"
							>Full Name</label
						>
						<input
							id="name-input"
							type="text"
							autocomplete="name"
							placeholder="AMARA PERERA"
							maxlength={MAX_DISPLAY_NAME_LENGTH}
							bind:value={displayName}
							class="font-bebas w-full border-b-2 border-charcoal bg-transparent px-0 py-4 text-4xl tracking-widest text-bone uppercase transition-colors placeholder:text-charcoal focus:border-volt focus:ring-0"
						/>
					</div>

					<div class="space-y-4">
						<Button
							variant="primary"
							class="h-16 w-full text-xl"
							onclick={handleSaveName}
							disabled={loading || !isValidDisplayName(displayName)}
						>
							Start Shopping
						</Button>
					</div>
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
</style>
