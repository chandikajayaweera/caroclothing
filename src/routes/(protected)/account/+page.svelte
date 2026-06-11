<script lang="ts">
	import { resolve } from '$app/paths';
	import { superForm } from 'sveltekit-superforms';
	import { ArrowRight, CheckCircle2, Pencil, UserRound } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	function initialEditingName() {
		return data.account.needsNameCompletion;
	}

	let editingName = $state(initialEditingName());

	function initialForm() {
		return data.nameForm;
	}

	const nameSuperform = superForm(initialForm(), {
		resetForm: false
	});
	const {
		form: nameForm,
		errors: nameErrors,
		message: nameMessage,
		submitting,
		enhance: nameEnhance
	} = nameSuperform;

	const feedback = $derived(actionData?.form?.message ?? $nameMessage);
	const memberSince = $derived(
		new Intl.DateTimeFormat('en-LK', { dateStyle: 'long' }).format(new Date(data.account.createdAt))
	);
	const summaryItems = $derived([
		{ label: 'Orders', value: data.summary.orders, href: '/account/orders' },
		{ label: 'Addresses', value: data.summary.addresses, href: '/account/addresses' },
		{ label: 'Saved', value: data.summary.wishlist, href: '/account/wishlist' },
		{ label: 'Reviews', value: data.summary.reviews, href: '/account/reviews' }
	] as const);
</script>

<svelte:head>
	<title>Account Overview | Caro Clothing</title>
	<meta name="description" content="Manage your Caro profile and account activity" />
</svelte:head>

<div class="space-y-10">
	<header class="border-b border-charcoal pb-6">
		<p class="font-mono text-[9px] tracking-[0.22em] text-volt uppercase">Account overview</p>
		<h2 class="mt-2 font-display text-4xl leading-none uppercase sm:text-5xl">Your space.</h2>
		<p class="mt-3 max-w-xl text-sm leading-relaxed text-ash">
			Keep your details current and get straight back to orders, saved pieces, and reviews.
		</p>
	</header>

	{#if data.account.needsNameCompletion}
		<section class="border border-volt/35 bg-volt/8 p-5" role="alert">
			<div class="flex gap-3">
				<UserRound class="mt-0.5 shrink-0 text-volt" size={20} aria-hidden="true" />
				<div>
					<h3 class="font-mono text-xs tracking-widest text-volt uppercase">Finish your profile</h3>
					<p class="mt-2 text-sm leading-relaxed text-bone/80">
						Add your full name before continuing. Your phone number will never be used as your name.
					</p>
				</div>
			</div>
		</section>
	{/if}

	{#if feedback}
		<p
			class="flex items-center gap-2 border border-volt/30 bg-volt/8 px-4 py-3 font-mono text-[10px] tracking-widest text-volt uppercase"
			role="status"
		>
			<CheckCircle2 size={15} aria-hidden="true" />
			{feedback}
		</p>
	{/if}

	<section class="grid gap-px bg-charcoal sm:grid-cols-2 lg:grid-cols-4">
		{#each summaryItems as item (item.label)}
			<a
				href={resolve(item.href)}
				class="group min-h-28 bg-void p-5 transition-colors hover:bg-charcoal/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
			>
				<div class="flex items-start justify-between">
					<span class="font-display text-4xl text-bone">{item.value}</span>
					<ArrowRight
						size={16}
						class="text-ash transition-colors group-hover:text-volt"
						aria-hidden="true"
					/>
				</div>
				<span class="mt-4 block font-mono text-[9px] tracking-widest text-ash uppercase">
					{item.label}
				</span>
			</a>
		{/each}
	</section>

	<section class="grid gap-8 border-t border-charcoal pt-8 md:grid-cols-[1fr_280px]">
		<div>
			<div class="flex min-h-11 items-center justify-between gap-4">
				<div>
					<p class="font-mono text-[9px] tracking-[0.2em] text-ash uppercase">Profile</p>
					<h3 class="mt-1 font-display text-3xl uppercase">Full name</h3>
				</div>
				{#if !editingName}
					<button
						type="button"
						onclick={() => (editingName = true)}
						class="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-mono text-[9px] tracking-widest text-volt uppercase hover:text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
					>
						<Pencil size={14} aria-hidden="true" />
						Edit
					</button>
				{/if}
			</div>

			{#if editingName}
				<form
					method="POST"
					action="?/updateName"
					use:nameEnhance
					novalidate
					class="mt-5 max-w-xl space-y-4"
				>
					<label
						for="account-name"
						class="block font-mono text-[9px] tracking-widest text-ash uppercase"
					>
						Full name
					</label>
					<input
						id="account-name"
						name="name"
						autocomplete="name"
						bind:value={$nameForm.name}
						aria-invalid={$nameErrors.name ? 'true' : undefined}
						aria-describedby={$nameErrors.name ? 'account-name-error' : undefined}
						class="min-h-12 w-full border border-charcoal bg-charcoal/25 px-4 text-base text-bone transition-colors outline-none focus:border-volt"
					/>
					{#if $nameErrors.name}
						<p id="account-name-error" class="font-mono text-[9px] text-red-400" role="alert">
							{$nameErrors.name[0]}
						</p>
					{/if}
					<div class="grid gap-3 sm:flex">
						<button
							type="submit"
							disabled={$submitting}
							class="min-h-11 w-full bg-volt px-5 font-mono text-[10px] tracking-widest text-void uppercase transition-colors hover:bg-bone disabled:cursor-wait disabled:opacity-50 sm:w-auto"
						>
							{$submitting ? 'Saving...' : 'Save name'}
						</button>
						{#if !data.account.needsNameCompletion}
							<button
								type="button"
								onclick={() => (editingName = false)}
								class="min-h-11 w-full border border-charcoal px-5 font-mono text-[10px] tracking-widest text-ash uppercase hover:border-ash hover:text-bone sm:w-auto"
							>
								Cancel
							</button>
						{/if}
					</div>
				</form>
			{:else}
				<p class="mt-4 text-lg text-bone">{data.account.name}</p>
			{/if}
		</div>

		<dl class="space-y-5 border-l-0 border-charcoal md:border-l md:pl-8">
			<div>
				<dt class="font-mono text-[9px] tracking-widest text-ash uppercase">Member since</dt>
				<dd class="mt-1 text-sm text-bone">{memberSince}</dd>
			</div>
			<div>
				<dt class="font-mono text-[9px] tracking-widest text-ash uppercase">Primary contact</dt>
				<dd class="mt-1 text-sm break-all text-bone">
					{data.account.email ?? data.account.phoneNumber ?? 'Not provided'}
				</dd>
			</div>
			<div>
				<a
					href={resolve('/account/security')}
					class="inline-flex min-h-11 items-center gap-2 font-mono text-[9px] tracking-widest text-volt uppercase hover:text-bone"
				>
					Manage security
					<ArrowRight size={14} aria-hidden="true" />
				</a>
			</div>
		</dl>
	</section>
</div>
