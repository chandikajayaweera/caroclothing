<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { authClient } from '$lib/client/modules/auth';
	import { parseAuthError } from '$lib/client/modules/auth/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const session = authClient.useSession();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let accounts = $state<any[]>([]);

	$effect(() => {
		if ($session.data?.user) {
			authClient.listAccounts().then(({ data }) => {
				if (data) accounts = data;
			});
		}
	});

	const isGoogleLinked = $derived(accounts.some((a) => a.providerId === 'google'));
	const profileUser = $derived(data.user ?? $session.data?.user);
	const displayEmail = $derived(
		profileUser?.email?.includes('phone.caroclothing.lk') ||
			profileUser?.email?.includes('anon.caroclothing.lk')
			? 'Linked'
			: profileUser?.email
	);
	const memberSince = $derived(
		profileUser?.createdAt ? new Date(profileUser.createdAt).toLocaleDateString() : ''
	);

	async function linkGoogle() {
		await authClient.linkSocial({ provider: 'google', callbackURL: '/account' });
	}

	async function unlinkGoogle() {
		if (!profileUser?.phoneNumber) {
			alert('You must have at least one login method.');
			return;
		}
		const { error } = await authClient.unlinkAccount({ providerId: 'google' });
		if (error) {
			alert(parseAuthError(error));
			return;
		}
		const { data } = await authClient.listAccounts();
		if (data) accounts = data;
	}

	async function unlinkPhone() {
		if (!isGoogleLinked) {
			alert('You must have at least one login method.');
			return;
		}
		const { error } = await authClient.updateUser({ phoneNumber: null });
		if (error) {
			alert(parseAuthError(error));
			return;
		}
		window.location.reload();
	}
</script>

<svelte:head>
	<title>Account | Caro Clothing</title>
	<meta name="description" content="Your account details" />
</svelte:head>

<div class="flex flex-col gap-10">
	<section class="flex flex-col gap-6">
		<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Profile Details</h2>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">Full Name</span>
				<div class="flex items-center gap-4">
					<span class="font-sans text-sm text-bone">{profileUser?.name}</span>
					<button class="font-mono text-[9px] tracking-widest text-volt uppercase hover:underline"
						>Edit</button
					>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">Phone Number</span>
				{#if profileUser?.phoneNumber}
					<div class="flex items-center gap-4">
						<span class="font-mono text-sm text-bone">{profileUser.phoneNumber}</span>
						<div class="bg-volt/10 px-1.5 py-0.5 font-mono text-[8px] text-volt uppercase">
							Verified
						</div>
						<button
							class="font-mono text-[9px] tracking-widest text-red-400 uppercase hover:underline"
							onclick={unlinkPhone}
						>
							Remove
						</button>
					</div>
				{:else}
					<div class="flex items-center gap-4">
						<span class="font-sans text-sm text-ash">Not provided</span>
						<button
							class="font-mono text-[9px] tracking-widest text-volt uppercase hover:underline"
						>
							Add
						</button>
					</div>
				{/if}
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase"
					>Google Account</span
				>
				{#if isGoogleLinked}
					<div class="flex items-center gap-4">
						<span class="font-sans text-sm text-bone">{displayEmail}</span>
						<button
							class="font-mono text-[9px] tracking-widest text-red-400 uppercase hover:underline"
							onclick={unlinkGoogle}
						>
							Remove
						</button>
					</div>
				{:else}
					<div class="flex items-center gap-4">
						<span class="font-sans text-sm text-ash">Not linked</span>
						<button
							class="font-mono text-[9px] tracking-widest text-volt uppercase hover:underline"
							onclick={linkGoogle}
						>
							Link
						</button>
					</div>
				{/if}
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">Member Since</span>
				<span class="font-mono text-sm text-bone uppercase">{memberSince}</span>
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-6">
		<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Activity Summary</h2>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
			<div class="flex flex-col gap-1 bg-charcoal/40 p-5">
				<span class="font-mono text-xl text-volt">5</span>
				<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Total Orders</span>
			</div>
			<div class="flex flex-col gap-1 bg-charcoal/40 p-5">
				<span class="font-mono text-xl text-volt">2</span>
				<span class="font-mono text-[9px] tracking-widest text-ash uppercase">Saved Items</span>
			</div>
		</div>
	</section>

	<section class="mt-4">
		<Button
			variant="outline"
			class="border-red-400/20 text-red-400 hover:border-red-400 hover:bg-red-400/5"
		>
			Delete Account
		</Button>
	</section>
</div>
