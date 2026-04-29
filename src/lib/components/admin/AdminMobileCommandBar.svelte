<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/client/modules/auth';
	import { LogOut, Menu, ShieldCheck, Store, UserRoundPen, X } from 'lucide-svelte';

	let { onOpenSidebar = () => {} }: { onOpenSidebar?: () => void } = $props();

	const session = authClient.useSession();
	let profileOpen = $state(false);

	const userInitials = $derived(
		($session.data?.user.name ?? $session.data?.user.email ?? 'A')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'A'
	);

	async function signOut() {
		profileOpen = false;
		await authClient.signOut();
		await goto('/', { invalidateAll: true });
	}
</script>

<header class="sticky top-0 z-40 border-b border-charcoal bg-void/90 backdrop-blur-md lg:hidden">
	<div class="flex h-14 items-center justify-between gap-3 px-4">
		<button
			type="button"
			class="grid h-10 w-10 place-items-center border border-charcoal text-ash transition-colors hover:border-volt hover:text-volt"
			aria-label="Open admin navigation"
			onclick={onOpenSidebar}
		>
			<Menu size={18} aria-hidden="true" />
		</button>

		<a href="/app" class="font-display text-2xl tracking-[0.2em] text-bone">CARO</a>

		<div class="relative">
			<button
				type="button"
				class="grid h-10 w-10 place-items-center border border-charcoal bg-charcoal/25 text-ash transition-colors hover:border-volt hover:text-volt"
				aria-label="Open profile menu"
				aria-expanded={profileOpen}
				onclick={() => (profileOpen = !profileOpen)}
			>
				{#if $session.data?.user.image}
					<img src={$session.data.user.image} alt="" class="h-7 w-7 object-cover" />
				{:else}
					<span class="font-mono text-[10px] text-volt" aria-hidden="true">{userInitials}</span>
				{/if}
			</button>

			{#if profileOpen}
				<button
					type="button"
					class="fixed inset-0 z-40 cursor-default bg-transparent"
					aria-label="Close profile menu"
					onclick={() => (profileOpen = false)}
				></button>

				<div
					class="absolute top-12 right-0 z-50 w-[min(320px,calc(100vw-24px))] border border-charcoal bg-void shadow-2xl shadow-black/50"
					role="dialog"
					aria-label="Profile menu"
				>
					<div class="flex items-start justify-between gap-4 border-b border-charcoal p-4">
						<div class="flex min-w-0 items-center gap-3">
							{#if $session.data?.user.image}
								<img src={$session.data.user.image} alt="" class="h-11 w-11 object-cover" />
							{:else}
								<div
									class="grid h-11 w-11 shrink-0 place-items-center border border-charcoal bg-charcoal font-mono text-xs text-volt"
									aria-hidden="true"
								>
									{userInitials}
								</div>
							{/if}
							<div class="min-w-0">
								<p class="truncate font-mono text-[11px] tracking-widest text-bone uppercase">
									{$session.data?.user.name ?? 'Admin'}
								</p>
								<p class="mt-1 truncate font-mono text-[9px] tracking-widest text-ash uppercase">
									{$session.data?.user.email ?? 'Admin session'}
								</p>
							</div>
						</div>
						<button
							type="button"
							class="text-ash transition-colors hover:text-bone"
							aria-label="Close profile menu"
							onclick={() => (profileOpen = false)}
						>
							<X size={16} aria-hidden="true" />
						</button>
					</div>

					<div class="p-2">
						<div class="mb-2 flex items-center gap-3 border border-charcoal bg-charcoal/30 p-3">
							<ShieldCheck size={16} class="text-volt" aria-hidden="true" />
							<div>
								<p class="font-mono text-[8px] tracking-[0.2em] text-ash/50 uppercase">Role</p>
								<p class="mt-1 font-mono text-[10px] tracking-widest text-volt uppercase">
									adminUser
								</p>
							</div>
						</div>

						<a
							href="/"
							class="flex h-11 items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:bg-charcoal/50 hover:text-bone"
							onclick={() => (profileOpen = false)}
						>
							<Store size={16} aria-hidden="true" />
							<span>View Store</span>
						</a>
						<a
							href="/account"
							class="flex h-11 items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:bg-charcoal/50 hover:text-bone"
							onclick={() => (profileOpen = false)}
						>
							<UserRoundPen size={16} aria-hidden="true" />
							<span>Edit Profile</span>
						</a>
						<button
							type="button"
							class="flex h-11 w-full items-center gap-3 px-3 text-left font-mono text-[10px] tracking-widest text-ash uppercase transition-colors hover:bg-charcoal/50 hover:text-bone"
							onclick={signOut}
						>
							<LogOut size={16} aria-hidden="true" />
							<span>Logout</span>
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</header>
