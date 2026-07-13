<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { authClient, signOutSession } from '$lib/client/modules/auth';
	import { ChevronDown, ShieldCheck, UserRoundPen, LogOut } from 'lucide-svelte';

	let {
		onClose = () => {}
	}: {
		onClose?: () => void;
	} = $props();

	const session = authClient.useSession();
	let mobileProfileExpanded = $state(false);
	let signingOut = $state(false);
	let actionError = $state<string | null>(null);

	const userInitials = $derived(
		($session.data?.user.name ?? $session.data?.user.email ?? 'A')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'A'
	);

	const userRole = $derived($session.data?.user?.role ?? 'adminUser');

	async function signOut() {
		if (signingOut) return;
		signingOut = true;
		actionError = null;
		const result = await signOutSession();
		if (!result.ok) {
			actionError = 'Sign out failed. Retry.';
			signingOut = false;
			return;
		}
		await goto(resolve('/'), { invalidateAll: true });
	}
</script>

<div class="block shrink-0 border-t border-charcoal bg-charcoal/5 p-3 lg:hidden">
	<button
		type="button"
		class="flex w-full cursor-pointer items-center justify-between gap-3 border border-charcoal bg-charcoal/25 p-3 text-left transition-colors outline-none hover:border-volt"
		onclick={() => (mobileProfileExpanded = !mobileProfileExpanded)}
		aria-expanded={mobileProfileExpanded}
		aria-label="Toggle user profile options"
	>
		<div class="flex min-w-0 items-center gap-3">
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
			<div class="min-w-0">
				<p class="truncate font-mono text-[10px] font-bold tracking-widest text-bone uppercase">
					{$session.data?.user.name ?? 'Admin'}
				</p>
				<p class="mt-0.5 truncate font-mono text-[8px] tracking-[0.18em] text-ash/60 uppercase">
					{$session.data?.user.email ?? 'Admin session'}
				</p>
			</div>
		</div>
		<ChevronDown
			size={14}
			class="shrink-0 text-ash transition-transform duration-200 {mobileProfileExpanded
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		/>
	</button>

	{#if mobileProfileExpanded}
		<div class="mt-2 space-y-1.5 border border-charcoal bg-void p-2">
			{#if actionError}
				<p
					class="border border-red-400/25 bg-red-950/20 p-2 font-sans text-xs text-red-300"
					role="alert"
				>
					{actionError}
				</p>
			{/if}
			<div class="flex items-center gap-3 border border-charcoal bg-charcoal/20 p-2.5">
				<ShieldCheck size={14} class="text-volt" aria-hidden="true" />
				<div>
					<p class="font-mono text-[8px] tracking-[0.2em] text-ash/50 uppercase">Role</p>
					<p class="mt-0.5 font-mono text-[9px] tracking-widest text-volt uppercase">{userRole}</p>
				</div>
			</div>

			<a
				href={resolve('/account')}
				class="flex h-11 cursor-pointer items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone focus-visible:ring-2 focus-visible:ring-volt"
				onclick={onClose}
			>
				<UserRoundPen size={14} aria-hidden="true" />
				<span>Edit Profile</span>
			</a>

			<button
				type="button"
				disabled={signingOut}
				class="flex h-11 w-full cursor-pointer items-center gap-3 px-3 text-left font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone focus-visible:ring-2 focus-visible:ring-volt"
				onclick={signOut}
			>
				<LogOut size={14} aria-hidden="true" />
				<span>{signingOut ? 'Signing out...' : 'Logout'}</span>
			</button>
		</div>
	{/if}
</div>
