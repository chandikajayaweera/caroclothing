<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { authClient } from '$lib/client/modules/auth';

	const session = authClient.useSession();
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
					<span class="font-sans text-sm text-bone">{$session.data?.user.name}</span>
					<button class="font-mono text-[9px] tracking-widest text-volt uppercase hover:underline"
						>Edit</button
					>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">Phone Number</span>
				<div class="flex items-center gap-4">
					<span class="font-mono text-sm text-bone">{$session.data?.user.phoneNumber}</span>
					<div class="bg-volt/10 px-1.5 py-0.5 font-mono text-[8px] text-volt uppercase">
						Verified
					</div>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">Email Address</span
				>
				<div class="flex items-center gap-4">
					<span class="font-sans text-sm text-bone">{$session.data?.user.email}</span>
					<button class="font-mono text-[9px] tracking-widest text-volt uppercase hover:underline"
						>Edit</button
					>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] tracking-widest text-ash/40 uppercase">Member Since</span>
				<span class="font-mono text-sm text-bone uppercase"
					>{$session.data?.user.createdAt.toLocaleDateString()}</span
				>
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
