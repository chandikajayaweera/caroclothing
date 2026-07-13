<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { authClient, signOutSession } from '$lib/client/modules/auth';
	import { LogOut, ShieldCheck, Store, UserRoundPen, X } from 'lucide-svelte';

	let { collapsed = false }: { collapsed?: boolean } = $props();

	const session = authClient.useSession();
	let profileOpen = $state(false);
	let signingOut = $state(false);
	let actionError = $state<string | null>(null);
	let profileContainer = $state<HTMLDivElement | null>(null);

	const userInitials = $derived(
		($session.data?.user.name ?? $session.data?.user.email ?? 'A')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'A'
	);

	const userRole = $derived($session.data?.user?.role ?? 'adminUser');

	function handleWindowPointerDown(event: PointerEvent): void {
		if (!profileOpen || !profileContainer) return;
		if (!profileContainer.contains(event.target as Node)) profileOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (profileOpen && event.key === 'Escape') profileOpen = false;
	}

	async function signOut(): Promise<void> {
		if (signingOut) return;
		signingOut = true;
		actionError = null;
		const result = await signOutSession();
		if (!result.ok) {
			actionError = 'Sign out failed. Retry.';
			signingOut = false;
			return;
		}
		profileOpen = false;
		await goto(resolve('/'), { invalidateAll: true });
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeydown} />

<div
	class="relative hidden shrink-0 border-t border-charcoal p-3 lg:block"
	bind:this={profileContainer}
>
	<button
		type="button"
		class="flex min-h-11 w-full items-center justify-center gap-3 border bg-charcoal/25 p-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-volt {profileOpen
			? 'border-volt bg-charcoal/40 text-volt'
			: 'border-charcoal hover:border-volt/60'} {collapsed
			? 'lg:justify-center'
			: 'lg:justify-start'}"
		aria-label="Open profile controls"
		aria-expanded={profileOpen}
		aria-controls="admin-profile-controls"
		onclick={() => (profileOpen = !profileOpen)}
	>
		{#if $session.data?.user.image}
			<img src={$session.data.user.image} alt="" class="h-9 w-9 object-cover" />
		{:else}
			<span
				class="grid h-9 w-9 shrink-0 place-items-center border border-charcoal/50 bg-void font-mono text-[10px] text-volt"
				aria-hidden="true"
			>
				{userInitials}
			</span>
		{/if}
		{#if !collapsed}
			<div class="hidden min-w-0 lg:block">
				<p class="truncate font-mono text-[10px] tracking-widest text-bone uppercase">
					{$session.data?.user.name ?? 'Admin'}
				</p>
				<p class="mt-0.5 truncate font-mono text-[8px] tracking-[0.18em] text-ash/60 uppercase">
					Account controls
				</p>
			</div>
		{/if}
	</button>

	{#if profileOpen}
		<section
			id="admin-profile-controls"
			class="absolute bottom-[calc(100%+0.75rem)] left-3 z-60 w-[min(20rem,calc(100vw-5rem))] border border-ash/20 bg-void shadow-2xl"
			aria-label="Admin profile controls"
		>
			<div class="flex items-start justify-between gap-3 border-b border-charcoal p-4">
				<div class="min-w-0">
					<p class="truncate font-mono text-[11px] tracking-widest text-bone uppercase">
						{$session.data?.user.name ?? 'Admin'}
					</p>
					<p class="mt-1 truncate font-sans text-xs text-ash">
						{$session.data?.user.email ?? 'Admin session'}
					</p>
				</div>
				<button
					type="button"
					class="grid h-9 w-9 shrink-0 place-items-center text-ash hover:text-bone focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
					aria-label="Close profile controls"
					onclick={() => (profileOpen = false)}
				>
					<X size={16} aria-hidden="true" />
				</button>
			</div>

			<div class="border-b border-charcoal p-3">
				<div class="flex items-center gap-3 border border-charcoal bg-charcoal/25 p-3">
					<ShieldCheck size={16} class="text-volt" aria-hidden="true" />
					<div>
						<p class="font-mono text-[8px] tracking-[0.2em] text-ash/60 uppercase">Role</p>
						<p class="mt-1 font-mono text-[10px] tracking-widest text-volt uppercase">
							{userRole}
						</p>
					</div>
				</div>
				{#if actionError}
					<p class="mt-3 font-sans text-xs text-red-300" role="alert">{actionError}</p>
				{/if}
			</div>

			<div class="grid gap-1 p-2">
				<a
					href={resolve('/account')}
					class="flex min-h-11 items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase hover:bg-charcoal/50 hover:text-bone focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
					onclick={() => (profileOpen = false)}
				>
					<UserRoundPen size={16} aria-hidden="true" />
					<span>Edit profile</span>
				</a>
				<a
					href={resolve('/')}
					class="flex min-h-11 items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase hover:bg-charcoal/50 hover:text-bone focus-visible:ring-2 focus-visible:ring-volt focus-visible:outline-none"
					onclick={() => (profileOpen = false)}
				>
					<Store size={16} aria-hidden="true" />
					<span>View store</span>
				</a>
				<div class="my-1 border-t border-charcoal"></div>
				<button
					type="button"
					disabled={signingOut}
					class="flex min-h-11 w-full items-center gap-3 px-3 text-left font-mono text-[10px] tracking-widest text-red-300 uppercase hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
					onclick={signOut}
				>
					<LogOut size={16} aria-hidden="true" />
					<span>{signingOut ? 'Signing out...' : 'Logout'}</span>
				</button>
			</div>
		</section>
	{/if}
</div>
