<script lang="ts">
	import AdminButton from './AdminButton.svelte';
	let {
		kicker,
		title,
		description,
		primaryAction = 'Create',
		items = []
	}: {
		kicker: string;
		title: string;
		description: string;
		primaryAction?: string;
		items?: string[];
	} = $props();
</script>

<svelte:head>
	<title>{title} | Caro Admin</title>
	<meta name="description" content={description} />
</svelte:head>

<section class="mx-auto max-w-7xl">
	<div class="items-end justify-between border-b border-charcoal pb-6 md:flex md:pb-8">
		<div>
			<p class="font-mono text-[10px] tracking-[0.2em] text-volt uppercase">{kicker}</p>
			<h1 class="mt-2 font-display text-6xl leading-none text-bone uppercase md:text-7xl">
				{title}
			</h1>
		</div>
		<AdminButton type="button" variant="volt" size="md" class="mt-5 md:mt-0">
			{primaryAction}
		</AdminButton>
	</div>

	<div class="mt-8 grid gap-4 lg:grid-cols-[1fr_360px]">
		<div class="border border-charcoal bg-charcoal/25 p-6 md:p-8">
			<p class="max-w-2xl font-sans text-sm leading-6 text-ash md:text-base">{description}</p>

			<div class="mt-8 border border-dashed border-ash/20 p-8 text-center">
				<p class="font-display text-4xl text-bone uppercase">Scaffold Ready</p>
				<p class="mt-2 font-mono text-[10px] tracking-widest text-ash uppercase">
					Wire data, table, filters, and actions here.
				</p>
			</div>
		</div>

		<aside class="border border-charcoal bg-void p-5">
			<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Build next</p>
			<div class="mt-5 flex flex-col gap-3">
				{#each items as item}
					<div class="border border-charcoal bg-charcoal/30 p-3">
						<p class="font-mono text-[10px] tracking-widest text-ash uppercase">{item}</p>
					</div>
				{/each}
			</div>
		</aside>
	</div>
</section>
