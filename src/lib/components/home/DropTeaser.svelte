<script lang="ts">
	import CountdownTimer from '../drops/CountdownTimer.svelte';
	import Button from '../ui/Button.svelte';

	interface Props {
		nextDrop?: {
			name: string;
			tagline: string;
			date: Date;
			slug: string;
		};
	}

	let { nextDrop }: Props = $props();

	let email = $state('');
	let subscribed = $state(false);

	function handleNotify(e: Event) {
		e.preventDefault();
		if (!email) return;
		subscribed = true;
	}
</script>

{#if nextDrop}
	<section class="border-t border-void bg-charcoal px-5 py-20 md:px-8 md:py-32 lg:px-12">
		<div class="mx-auto flex max-w-7xl flex-col items-center lg:grid lg:grid-cols-2 lg:gap-20">
			<!-- Left: Info -->
			<div class="flex w-full flex-col gap-8">
				<div>
					<span class="mb-4 block font-mono text-[10px] tracking-[0.3em] text-volt uppercase"
						>NEXT DROP</span
					>
					<h2
						class="mb-4 font-display text-[72px] leading-[0.85] text-bone uppercase md:text-[96px]"
					>
						{nextDrop.name}
					</h2>
					<p class="max-w-md font-sans text-sm text-ash md:text-base">
						{nextDrop.tagline}
					</p>
				</div>

				<CountdownTimer targetDate={nextDrop.date} />

				<div class="mt-4">
					{#if subscribed}
						<div class="flex max-w-md flex-col gap-1 border border-volt/20 bg-volt/5 p-6">
							<span class="font-display text-2xl text-volt uppercase">YOU'RE ON THE LIST.</span>
							<p class="font-mono text-[10px] tracking-widest text-ash uppercase">
								We'll text you when it drops.
							</p>
						</div>
					{:else}
						<form class="flex max-w-md flex-col gap-3" onsubmit={handleNotify}>
							<div class="flex flex-col gap-1">
								<div class="flex border-b border-ash/30 transition-colors focus-within:border-volt">
									<input
										type="text"
										bind:value={email}
										placeholder="PHONE OR EMAIL"
										class="flex-1 bg-transparent py-3 font-mono text-[10px] tracking-widest text-bone uppercase outline-none placeholder:text-ash/40"
										required
									/>
									<button
										type="submit"
										class="px-4 font-mono text-[10px] tracking-widest text-volt uppercase transition-colors hover:text-bone"
									>
										NOTIFY ME
									</button>
								</div>
								<span class="mt-2 font-mono text-[9px] tracking-widest text-ash/40 uppercase">
									No spam. First access. Unsubscribe anytime.
								</span>
							</div>
						</form>
					{/if}
				</div>
			</div>

			<!-- Right: Visual Teaser (Desktop only) -->
			<div
				class="relative hidden h-[500px] w-full overflow-hidden border border-charcoal bg-void lg:flex"
			>
				<div class="absolute inset-0 flex items-center justify-center opacity-10">
					<span
						class="font-display text-[300px] leading-none tracking-tighter text-bone select-none"
					>
						002
					</span>
				</div>
				<div class="relative z-10 flex h-full flex-col p-12">
					<div class="mt-auto">
						<span class="mb-2 block font-mono text-[9px] tracking-[0.3em] text-ash uppercase"
							>RESTRICTED ACCESS</span
						>
						<p
							class="max-w-[200px] font-mono text-[10px] leading-relaxed tracking-widest text-ash/60 uppercase"
						>
							ARCHIVED SILHOUETTES<br />
							EXPERIMENTAL FABRICS<br />
							LIMITED RELEASE
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>
{/if}
