<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';

	const user = {
		name: 'Kasun Mendis',
		phone: '+94 77 123 4567',
		email: 'kasun@example.com',
		joinedAt: 'November 2024'
	};
</script>

<div class="flex flex-col gap-10">
	<section class="flex flex-col gap-6">
		<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Profile Details</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] text-ash/40 uppercase tracking-widest">Full Name</span>
				<div class="flex items-center gap-4">
					<span class="font-sans text-sm text-bone">{user.name}</span>
					<button class="font-mono text-[9px] text-volt uppercase tracking-widest hover:underline">Edit</button>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] text-ash/40 uppercase tracking-widest">Phone Number</span>
				<div class="flex items-center gap-4">
					<span class="font-mono text-sm text-bone">{user.phone}</span>
					<div class="bg-volt/10 text-volt text-[8px] px-1.5 py-0.5 font-mono uppercase">Verified</div>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] text-ash/40 uppercase tracking-widest">Email Address</span>
				<div class="flex items-center gap-4">
					<span class="font-sans text-sm text-bone">{user.email}</span>
					<button class="font-mono text-[9px] text-volt uppercase tracking-widest hover:underline">Edit</button>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="font-mono text-[9px] text-ash/40 uppercase tracking-widest">Member Since</span>
				<span class="font-mono text-sm text-bone uppercase">{user.joinedAt}</span>
			</div>
		</div>
	</section>

	<section class="flex flex-col gap-6">
		<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Activity Summary</h2>
		<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
			<div class="bg-charcoal/40 p-5 flex flex-col gap-1">
				<span class="font-mono text-xl text-volt">5</span>
				<span class="font-mono text-[9px] text-ash uppercase tracking-widest">Total Orders</span>
			</div>
			<div class="bg-charcoal/40 p-5 flex flex-col gap-1">
				<span class="font-mono text-xl text-volt">2</span>
				<span class="font-mono text-[9px] text-ash uppercase tracking-widest">Saved Items</span>
			</div>
		</div>
	</section>

	<section class="mt-4">
		<Button variant="outline" class="text-red-400 border-red-400/20 hover:border-red-400 hover:bg-red-400/5">
			Delete Account
		</Button>
	</section>
</div>
