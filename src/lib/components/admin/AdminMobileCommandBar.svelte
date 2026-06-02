<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/client/modules/auth';
	import { LogOut, Menu, ShieldCheck, Store, UserRoundPen, X } from 'lucide-svelte';
	import { DropdownMenu } from 'bits-ui';
	import { scale } from 'svelte/transition';

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
			<DropdownMenu.Root bind:open={profileOpen}>
				<DropdownMenu.Trigger
					class="grid h-10 w-10 place-items-center border border-charcoal bg-charcoal/25 text-ash transition-colors outline-none hover:border-volt hover:text-volt"
					aria-label="Open profile menu"
				>
					{#if $session.data?.user.image}
						<img src={$session.data.user.image} alt="" class="h-7 w-7 object-cover" />
					{:else}
						<span class="font-mono text-[10px] text-volt" aria-hidden="true">{userInitials}</span>
					{/if}
				</DropdownMenu.Trigger>

				{#if profileOpen}
					<DropdownMenu.Portal>
						<DropdownMenu.Content sideOffset={8} class="z-50 outline-none">
							{#snippet child({ props, open })}
								{#if open}
									<div
										{...props}
										transition:scale={{ duration: 120, start: 0.96 }}
										class="z-50 w-[min(320px,calc(100vw-24px))] border border-charcoal bg-void shadow-2xl shadow-black/50 outline-none"
									>
										<div
											class="flex items-start justify-between gap-4 border-b border-charcoal p-4"
										>
											<div class="flex min-w-0 items-center gap-3">
												{#if $session.data?.user.image}
													<img
														src={$session.data.user.image}
														alt=""
														class="h-11 w-11 object-cover"
													/>
												{:else}
													<div
														class="grid h-11 w-11 shrink-0 place-items-center border border-charcoal bg-charcoal font-mono text-xs text-volt"
														aria-hidden="true"
													>
														{userInitials}
													</div>
												{/if}
												<div class="min-w-0">
													<p
														class="truncate font-mono text-[11px] tracking-widest text-bone uppercase"
													>
														{$session.data?.user.name ?? 'Admin'}
													</p>
													<p
														class="mt-1 truncate font-mono text-[9px] tracking-widest text-ash uppercase"
													>
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
											<div
												class="mb-2 flex items-center gap-3 border border-charcoal bg-charcoal/30 p-3"
											>
												<ShieldCheck size={16} class="text-volt" aria-hidden="true" />
												<div>
													<p class="font-mono text-[8px] tracking-[0.2em] text-ash/50 uppercase">
														Role
													</p>
													<p class="mt-1 font-mono text-[10px] tracking-widest text-volt uppercase">
														adminUser
													</p>
												</div>
											</div>

											<DropdownMenu.Item>
												{#snippet child({ props })}
													<a
														href={resolve('/')}
														{...props}
														class="flex h-11 items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone data-[highlighted]:bg-charcoal/50 data-[highlighted]:text-bone"
														onclick={() => (profileOpen = false)}
													>
														<Store size={16} aria-hidden="true" />
														<span>View Store</span>
													</a>
												{/snippet}
											</DropdownMenu.Item>
											<DropdownMenu.Item>
												{#snippet child({ props })}
													<a
														href={resolve('/account')}
														{...props}
														class="flex h-11 items-center gap-3 px-3 font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone data-[highlighted]:bg-charcoal/50 data-[highlighted]:text-bone"
														onclick={() => (profileOpen = false)}
													>
														<UserRoundPen size={16} aria-hidden="true" />
														<span>Edit Profile</span>
													</a>
												{/snippet}
											</DropdownMenu.Item>
											<DropdownMenu.Item>
												{#snippet child({ props })}
													<button
														type="button"
														{...props}
														class="flex h-11 w-full items-center gap-3 px-3 text-left font-mono text-[10px] tracking-widest text-ash uppercase transition-colors outline-none hover:bg-charcoal/50 hover:text-bone data-[highlighted]:bg-charcoal/50 data-[highlighted]:text-bone"
														onclick={signOut}
													>
														<LogOut size={16} aria-hidden="true" />
														<span>Logout</span>
													</button>
												{/snippet}
											</DropdownMenu.Item>
										</div>
									</div>
								{/if}
							{/snippet}
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				{/if}
			</DropdownMenu.Root>
		</div>
	</div>
</header>
