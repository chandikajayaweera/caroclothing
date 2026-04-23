<script lang="ts">
	const addresses = [
		{
			id: 'a1',
			label: 'Home',
			recipientName: 'Kasun Mendis',
			addressLine1: '12 Galle Road',
			city: 'Colombo 03',
			district: 'Colombo',
			isDefault: true
		}
	];
</script>

<div class="flex flex-col gap-6">
	<div class="flex justify-between items-baseline">
		<h2 class="font-mono text-xs text-ash uppercase tracking-[0.2em]">Saved Addresses</h2>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		{#each addresses as address}
			<div class="bg-charcoal/40 p-5 flex flex-col gap-4 border border-transparent hover:border-ash/10 transition-colors">
				<div class="flex justify-between items-start">
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] text-volt uppercase tracking-widest">{address.label}</span>
						{#if address.isDefault}
							<span class="w-fit border border-volt/30 text-volt font-mono text-[8px] px-1.5 py-0.5 uppercase">Default</span>
						{/if}
					</div>
					<div class="flex gap-4">
						<button class="font-mono text-[9px] text-ash/60 uppercase tracking-widest hover:text-bone">Edit</button>
						<button class="font-mono text-[9px] text-red-400/60 uppercase tracking-widest hover:text-red-400">Delete</button>
					</div>
				</div>

				<div class="flex flex-col font-sans text-sm text-bone leading-relaxed">
					<span class="font-medium">{address.recipientName}</span>
					<span>{address.addressLine1}</span>
					<span>{address.city}, {address.district}</span>
				</div>
			</div>
		{/each}

		<button class="border border-dashed border-ash/20 p-8 flex flex-col items-center justify-center gap-3 group hover:border-volt transition-colors">
			<span class="font-mono text-2xl text-ash group-hover:text-volt transition-colors">+</span>
			<span class="font-mono text-[10px] text-ash uppercase tracking-widest group-hover:text-bone">Add New Address</span>
		</button>
	</div>
</div>
