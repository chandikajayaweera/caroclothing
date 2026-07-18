<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Dialog } from 'bits-ui';
	import {
		AlertTriangle,
		CheckCircle2,
		Link,
		LogOut,
		MonitorSmartphone,
		Phone,
		ShieldCheck,
		Trash2,
		Unlink
	} from 'lucide-svelte';
	import { authClient, signOutSession } from '$lib/client/auth';
	import {
		getAuthErrorRetryAfterSeconds,
		OTP_RATE_LIMITED_MESSAGE,
		parseAuthError,
		parseUnknownError
	} from '$lib/client/auth/utils';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form?: ActionData } = $props();

	$effect(() => {
		if (data.oauthError) {
			providerError = data.oauthError;
			goto(resolve('/account/security'), { replaceState: true, noScroll: true, keepFocus: true });
		}
	});

	let providerBusy = $state(false);
	let providerMessage = $state('');
	let providerError = $state('');
	let phonePanelOpen = $state(false);
	let phoneStep = $state<'number' | 'otp'>('number');
	let phoneDigits = $state('');
	let otpCode = $state('');
	let otpBusy = $state(false);
	let deleteOpen = $state(false);
	let deleteConfirmation = $state('');
	let deleteBusy = $state(false);
	let deleteError = $state('');
	let revokingSessionId = $state<string | null>(null);

	const isGoogleLinked = $derived(
		data.account.authMethods.some((method) => method.type === 'google')
	);
	const canRemovePhone = $derived(Boolean(data.account.phoneNumber && isGoogleLinked));
	const canRemoveGoogle = $derived(Boolean(isGoogleLinked && data.account.phoneNumber));
	const actionMessage = $derived(form?.form?.message);

	function resetProviderFeedback() {
		providerMessage = '';
		providerError = '';
	}

	async function linkGoogle() {
		if (providerBusy) return;
		resetProviderFeedback();
		providerBusy = true;
		try {
			const result = await authClient.linkSocial({
				provider: 'google',
				callbackURL: '/account/security',
				errorCallbackURL: '/account/security'
			});
			if (result?.error) providerError = parseAuthError(result.error);
		} catch (error) {
			providerError = parseUnknownError(error);
		} finally {
			providerBusy = false;
		}
	}

	async function unlinkGoogle() {
		if (!canRemoveGoogle || providerBusy) return;
		resetProviderFeedback();
		providerBusy = true;
		try {
			const { error } = await authClient.unlinkAccount({ providerId: 'google' });
			if (error) {
				providerError = parseAuthError(error);
				return;
			}
			providerMessage = 'Google account removed.';
			await invalidateAll();
		} catch (error) {
			providerError = parseUnknownError(error);
		} finally {
			providerBusy = false;
		}
	}

	async function removePhone() {
		if (!canRemovePhone || providerBusy) return;
		resetProviderFeedback();
		providerBusy = true;
		try {
			const { error } = await authClient.updateUser({ phoneNumber: null });
			if (error) {
				providerError = parseAuthError(error);
				return;
			}
			providerMessage = 'Phone number removed.';
			await invalidateAll();
		} catch (error) {
			providerError = parseUnknownError(error);
		} finally {
			providerBusy = false;
		}
	}

	function normalizedPhone(): string {
		return `+94${phoneDigits.replace(/\D/g, '').slice(0, 9)}`;
	}

	async function sendPhoneOtp() {
		providerError = '';
		providerMessage = '';
		const digits = phoneDigits.replace(/\D/g, '');
		if (!/^7\d{8}$/.test(digits)) {
			providerError = 'Enter a valid Sri Lankan mobile number.';
			return;
		}

		otpBusy = true;
		try {
			const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalizedPhone() });
			if (error) {
				const retryAfter = getAuthErrorRetryAfterSeconds(error);
				providerError =
					parseAuthError(error) === OTP_RATE_LIMITED_MESSAGE && retryAfter
						? `${OTP_RATE_LIMITED_MESSAGE} Try again in ${retryAfter} seconds.`
						: parseAuthError(error);
				return;
			}
			phoneStep = 'otp';
			providerMessage = 'Verification code sent.';
		} catch (error) {
			providerError = parseUnknownError(error);
		} finally {
			otpBusy = false;
		}
	}

	async function verifyPhoneOtp() {
		if (!/^\d{6}$/.test(otpCode)) {
			providerError = 'Enter the 6-digit verification code.';
			return;
		}

		otpBusy = true;
		providerError = '';
		try {
			const { error } = await authClient.phoneNumber.verify({
				phoneNumber: normalizedPhone(),
				code: otpCode,
				updatePhoneNumber: true
			});
			if (error) {
				providerError = parseAuthError(error);
				return;
			}
			providerMessage = 'Phone number verified.';
			phonePanelOpen = false;
			phoneStep = 'number';
			phoneDigits = '';
			otpCode = '';
			await invalidateAll();
		} catch (error) {
			providerError = parseUnknownError(error);
		} finally {
			otpBusy = false;
		}
	}

	async function signOutCurrent() {
		const result = await signOutSession();
		if (!result.ok) {
			providerError = parseUnknownError(result.error);
			return;
		}
		await goto(resolve('/'), { invalidateAll: true });
	}

	function enhanceRevokeSession(sessionId: string): SubmitFunction {
		return () => {
			revokingSessionId = sessionId;
			return async ({ update }) => {
				await update();
				revokingSessionId = null;
			};
		};
	}

	async function deleteAccount() {
		if (deleteConfirmation !== 'DELETE' || deleteBusy) return;
		deleteBusy = true;
		deleteError = '';
		try {
			const { error } = await authClient.deleteUser({ callbackURL: '/' });
			if (error) {
				const parsed = parseAuthError(error);
				deleteError =
					error.code === 'SESSION_EXPIRED'
						? 'Your session is no longer fresh. Sign out, sign in again, then retry deletion.'
						: parsed;
				return;
			}
			await goto(resolve('/'), { invalidateAll: true });
		} catch (error) {
			deleteError = parseUnknownError(error);
		} finally {
			deleteBusy = false;
		}
	}

	function describeDevice(userAgent: string | null): string {
		if (!userAgent) return 'Unknown device';
		if (/iphone|ipad/i.test(userAgent)) return 'Apple mobile device';
		if (/android/i.test(userAgent)) return 'Android device';
		if (/windows/i.test(userAgent)) return 'Windows device';
		if (/macintosh|mac os/i.test(userAgent)) return 'Mac device';
		return 'Web browser';
	}

	function formatDate(value: Date | string): string {
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

<svelte:head>
	<title>Account Security | Caro Clothing</title>
	<meta name="description" content="Manage your sign-in methods, sessions, and Caro account" />
</svelte:head>

<div class="space-y-10">
	<header class="border-b border-charcoal pb-6">
		<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">Account security</p>
		<h2 class="mt-2 font-display text-4xl leading-none uppercase sm:text-5xl">Access control.</h2>
		<p class="mt-3 max-w-xl text-sm leading-relaxed text-ash">
			Manage the ways you sign in, review active sessions, or permanently delete your account.
		</p>
	</header>

	{#if providerMessage || actionMessage}
		<p
			class="flex items-center gap-2 border border-volt/30 bg-volt/8 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
			role="status"
		>
			<CheckCircle2 size={15} aria-hidden="true" />
			{providerMessage || actionMessage}
		</p>
	{/if}
	{#if providerError}
		<p class="border border-red-400/30 bg-red-400/8 px-4 py-3 text-sm text-red-300" role="alert">
			{providerError}
		</p>
	{/if}

	<section class="space-y-4">
		<div>
			<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Sign-in methods</p>
			<h3 class="mt-1 font-display text-3xl uppercase">Linked access</h3>
		</div>

		<div class="divide-y divide-charcoal border-y border-charcoal">
			<div class="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
				<div class="flex gap-4">
					<Phone class="mt-1 shrink-0 text-volt" size={20} aria-hidden="true" />
					<div>
						<h4 class="font-mono text-xs tracking-widest uppercase">Phone number</h4>
						<p class="mt-1 text-sm text-ash">
							{data.account.phoneNumber ?? 'No phone number linked'}
						</p>
						{#if data.account.phoneNumber && !canRemovePhone}
							<p class="mt-2 text-xs text-ash/70">
								Link Google before removing your only sign-in method.
							</p>
						{/if}
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
					<button
						type="button"
						onclick={() => {
							phonePanelOpen = !phonePanelOpen;
							phoneStep = 'number';
							providerError = '';
						}}
						class="min-h-11 border border-charcoal px-4 font-mono text-[9px] tracking-widest text-bone uppercase hover:border-volt hover:text-volt"
					>
						{data.account.phoneNumber ? 'Change' : 'Add'}
					</button>
					{#if canRemovePhone}
						<button
							type="button"
							onclick={removePhone}
							disabled={providerBusy}
							class="min-h-11 px-4 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:text-red-200 disabled:opacity-50"
						>
							Remove
						</button>
					{/if}
				</div>
			</div>

			{#if phonePanelOpen}
				<div class="bg-charcoal/20 p-5">
					<div class="max-w-lg space-y-4">
						{#if phoneStep === 'number'}
							<label
								for="security-phone"
								class="block font-mono text-[9px] tracking-widest text-ash uppercase"
							>
								New Sri Lankan mobile number
							</label>
							<div class="flex min-h-12 border border-charcoal bg-void focus-within:border-volt">
								<span
									class="flex items-center border-r border-charcoal px-3 font-mono text-sm text-ash"
								>
									+94
								</span>
								<input
									id="security-phone"
									type="tel"
									inputmode="numeric"
									autocomplete="tel-national"
									bind:value={phoneDigits}
									oninput={(event) => {
										phoneDigits = (event.currentTarget as HTMLInputElement).value
											.replace(/\D/g, '')
											.slice(0, 9);
									}}
									placeholder="7X XXX XXXX"
									class="min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-bone outline-none"
								/>
							</div>
							<button
								type="button"
								onclick={sendPhoneOtp}
								disabled={otpBusy}
								class="min-h-11 bg-volt px-5 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone disabled:opacity-50"
							>
								{otpBusy ? 'Sending...' : 'Send code'}
							</button>
						{:else}
							<label
								for="security-otp"
								class="block font-mono text-[9px] tracking-widest text-ash uppercase"
							>
								6-digit verification code
							</label>
							<input
								id="security-otp"
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								maxlength="6"
								bind:value={otpCode}
								oninput={(event) => {
									otpCode = (event.currentTarget as HTMLInputElement).value
										.replace(/\D/g, '')
										.slice(0, 6);
								}}
								class="min-h-12 w-full border border-charcoal bg-void px-4 font-mono text-xl tracking-[0.35em] text-bone outline-none focus:border-volt"
							/>
							<div class="flex flex-wrap gap-3">
								<button
									type="button"
									onclick={verifyPhoneOtp}
									disabled={otpBusy}
									class="min-h-11 bg-volt px-5 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-bone disabled:opacity-50"
								>
									{otpBusy ? 'Verifying...' : 'Verify number'}
								</button>
								<button
									type="button"
									onclick={() => (phoneStep = 'number')}
									class="min-h-11 px-4 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone"
								>
									Change number
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<div class="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
				<div class="flex gap-4">
					<ShieldCheck class="mt-1 shrink-0 text-volt" size={20} aria-hidden="true" />
					<div>
						<h4 class="font-mono text-xs tracking-widest uppercase">Google</h4>
						<p class="mt-1 text-sm text-ash">
							{isGoogleLinked ? (data.account.email ?? 'Google account linked') : 'Not linked'}
						</p>
						{#if isGoogleLinked && !canRemoveGoogle}
							<p class="mt-2 text-xs text-ash/70">
								Add a verified phone number before removing Google.
							</p>
						{/if}
					</div>
				</div>
				{#if isGoogleLinked}
					{#if canRemoveGoogle}
						<button
							type="button"
							onclick={unlinkGoogle}
							disabled={providerBusy}
							class="flex min-h-11 w-full items-center justify-center gap-2 px-4 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:text-red-200 disabled:opacity-50 sm:w-auto"
						>
							<Unlink size={14} aria-hidden="true" />
							Remove
						</button>
					{/if}
				{:else}
					<button
						type="button"
						onclick={linkGoogle}
						disabled={providerBusy}
						class="flex min-h-11 w-full items-center justify-center gap-2 border border-charcoal px-4 font-mono text-[9px] tracking-widest text-bone uppercase hover:border-volt hover:text-volt disabled:opacity-50 sm:w-auto"
					>
						<Link size={14} aria-hidden="true" />
						Link Google
					</button>
				{/if}
			</div>
		</div>
	</section>

	<section class="space-y-4 border-t border-charcoal pt-8">
		<div>
			<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Sessions</p>
			<h3 class="mt-1 font-display text-3xl uppercase">Signed-in devices</h3>
		</div>
		<div class="divide-y divide-charcoal border-y border-charcoal">
			{#each data.sessions.items as session (session.id)}
				<div class="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
					<div class="flex gap-4">
						<MonitorSmartphone class="mt-1 shrink-0 text-ash" size={20} aria-hidden="true" />
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<h4 class="font-mono text-xs tracking-widest uppercase">
									{describeDevice(session.userAgent)}
								</h4>
								{#if session.isCurrent}
									<span
										class="border border-volt/30 px-2 py-0.5 font-mono text-[8px] text-volt uppercase"
									>
										Current
									</span>
								{/if}
							</div>
							<p class="mt-1 font-mono text-[9px] text-ash">
								{session.ipAddress ?? 'IP unavailable'} / Active {formatDate(session.updatedAt)}
							</p>
						</div>
					</div>
					{#if session.isCurrent}
						<button
							type="button"
							onclick={signOutCurrent}
							class="flex min-h-11 w-full items-center justify-center gap-2 border border-charcoal px-4 font-mono text-[9px] tracking-widest text-ash uppercase hover:text-bone sm:w-auto sm:border-0"
						>
							<LogOut size={14} aria-hidden="true" />
							Sign out
						</button>
					{:else}
						<form
							method="POST"
							action="?/revokeSession"
							use:enhance={enhanceRevokeSession(session.id)}
						>
							<input type="hidden" name="sessionId" value={session.id} />
							<button
								type="submit"
								disabled={revokingSessionId === session.id}
								class="min-h-11 w-full border border-red-400/25 px-4 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:text-red-200 sm:w-auto sm:border-0"
							>
								{revokingSessionId === session.id ? 'Signing out...' : 'Sign out'}
							</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<section class="border-t border-red-400/25 pt-8">
		<div class="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-red-300 uppercase">Danger zone</p>
				<h3 class="mt-1 font-display text-3xl uppercase">Delete account</h3>
				<p class="mt-2 max-w-2xl text-sm leading-relaxed text-ash">
					This permanently removes your profile, bag, addresses, wishlist, and reviews. Historical
					orders remain anonymized for financial records.
				</p>
			</div>
			<button
				type="button"
				onclick={() => (deleteOpen = true)}
				class="flex min-h-11 w-full items-center justify-center gap-2 border border-red-400/40 px-5 font-mono text-[9px] tracking-widest text-red-300 uppercase hover:border-red-300 hover:text-red-200 md:w-auto"
			>
				<Trash2 size={14} aria-hidden="true" />
				Delete account
			</button>
		</div>
	</section>
</div>

<Dialog.Root bind:open={deleteOpen}>
	{#if deleteOpen}
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-50 bg-void/90" />
			<div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto px-4 py-6">
				<Dialog.Content
					class="w-full max-w-lg border border-red-400/30 bg-charcoal p-6 outline-none"
				>
					<Dialog.Title class="flex items-center gap-3 font-display text-3xl uppercase">
						<AlertTriangle class="text-red-300" size={24} aria-hidden="true" />
						Delete account?
					</Dialog.Title>
					<Dialog.Description class="mt-3 text-sm leading-relaxed text-ash">
						This cannot be undone. Type <strong class="text-bone">DELETE</strong> to confirm.
					</Dialog.Description>
					<label
						for="delete-confirmation"
						class="mt-5 block font-mono text-[9px] tracking-widest text-ash uppercase"
					>
						Confirmation
					</label>
					<input
						id="delete-confirmation"
						bind:value={deleteConfirmation}
						autocomplete="off"
						class="mt-2 min-h-12 w-full border border-charcoal bg-void px-4 font-mono text-sm text-bone outline-none focus:border-red-300"
					/>
					{#if deleteError}
						<p class="mt-3 text-sm text-red-300" role="alert">{deleteError}</p>
					{/if}
					<div class="mt-6 grid gap-3 sm:grid-cols-2">
						<button
							type="button"
							onclick={deleteAccount}
							disabled={deleteConfirmation !== 'DELETE' || deleteBusy}
							class="min-h-11 bg-red-400 px-4 font-mono text-[10px] tracking-widest text-void uppercase hover:bg-red-300 disabled:opacity-40"
						>
							{deleteBusy ? 'Deleting...' : 'Delete permanently'}
						</button>
						<button
							type="button"
							onclick={() => {
								deleteOpen = false;
								deleteConfirmation = '';
								deleteError = '';
							}}
							class="min-h-11 border border-ash/30 px-4 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-bone hover:text-bone"
						>
							Cancel
						</button>
					</div>
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
