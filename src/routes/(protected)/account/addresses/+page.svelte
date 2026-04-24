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

<svelte:head>
	<title>Addresses | Caro Clothing</title>
	<meta name="description" content="Your saved addresses" />
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex items-baseline justify-between">
		<h2 class="font-mono text-xs tracking-[0.2em] text-ash uppercase">Saved Addresses</h2>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each addresses as address}
			<div
				class="flex flex-col gap-4 border border-transparent bg-charcoal/40 p-5 transition-colors hover:border-ash/10"
			>
				<div class="flex items-start justify-between">
					<div class="flex flex-col gap-1">
						<span class="font-mono text-[9px] tracking-widest text-volt uppercase"
							>{address.label}</span
						>
						{#if address.isDefault}
							<span
								class="w-fit border border-volt/30 px-1.5 py-0.5 font-mono text-[8px] text-volt uppercase"
								>Default</span
							>
						{/if}
					</div>
					<div class="flex gap-4">
						<button
							class="font-mono text-[9px] tracking-widest text-ash/60 uppercase hover:text-bone"
							>Edit</button
						>
						<button
							class="font-mono text-[9px] tracking-widest text-red-400/60 uppercase hover:text-red-400"
							>Delete</button
						>
					</div>
				</div>

				<div class="flex flex-col font-sans text-sm leading-relaxed text-bone">
					<span class="font-medium">{address.recipientName}</span>
					<span>{address.addressLine1}</span>
					<span>{address.city}, {address.district}</span>
				</div>
			</div>
		{/each}

		<button
			class="group flex flex-col items-center justify-center gap-3 border border-dashed border-ash/20 p-8 transition-colors hover:border-volt"
		>
			<span class="font-mono text-2xl text-ash transition-colors group-hover:text-volt">+</span>
			<span class="font-mono text-[10px] tracking-widest text-ash uppercase group-hover:text-bone"
				>Add New Address</span
			>
		</button>
	</div>
</div>
