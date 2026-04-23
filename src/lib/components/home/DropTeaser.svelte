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
	<section class="bg-charcoal py-20 md:py-32 px-5 md:px-8 lg:px-12 border-t border-void">
		<div class="max-w-7xl mx-auto flex flex-col lg:grid lg:grid-cols-2 lg:gap-20 items-center">
			<!-- Left: Info -->
			<div class="flex flex-col gap-8 w-full">
				<div>
					<span class="font-mono text-[10px] text-volt uppercase tracking-[0.3em] mb-4 block">NEXT DROP</span>
					<h2 class="font-display text-[72px] md:text-[96px] leading-[0.85] text-bone uppercase mb-4">
						{nextDrop.name}
					</h2>
					<p class="font-sans text-sm md:text-base text-ash max-w-md">
						{nextDrop.tagline}
					</p>
				</div>

				<CountdownTimer targetDate={nextDrop.date} />

				<div class="mt-4">
					{#if subscribed}
						<div class="bg-volt/5 border border-volt/20 p-6 flex flex-col gap-1 max-w-md">
							<span class="font-display text-2xl text-volt uppercase">YOU'RE ON THE LIST.</span>
							<p class="font-mono text-[10px] text-ash uppercase tracking-widest">We'll text you when it drops.</p>
						</div>
					{:else}
						<form class="flex flex-col gap-3 max-w-md" onsubmit={handleNotify}>
							<div class="flex flex-col gap-1">
								<div class="flex border-b border-ash/30 focus-within:border-volt transition-colors">
									<input
										type="text"
										bind:value={email}
										placeholder="PHONE OR EMAIL"
										class="flex-1 bg-transparent py-3 font-mono text-[10px] text-bone placeholder:text-ash/40 outline-none uppercase tracking-widest"
										required
									/>
									<button type="submit" class="font-mono text-[10px] text-volt uppercase tracking-widest px-4 hover:text-bone transition-colors">
										NOTIFY ME
									</button>
								</div>
								<span class="font-mono text-[9px] text-ash/40 uppercase tracking-widest mt-2">
									No spam. First access. Unsubscribe anytime.
								</span>
							</div>
						</form>
					{/if}
				</div>
			</div>

			<!-- Right: Visual Teaser (Desktop only) -->
			<div class="hidden lg:flex w-full h-[500px] bg-void relative overflow-hidden border border-charcoal">
				<div class="absolute inset-0 flex items-center justify-center opacity-10">
					<span class="font-display text-[300px] text-bone leading-none select-none tracking-tighter">
						002
					</span>
				</div>
				<div class="relative z-10 p-12 flex flex-col h-full">
					<div class="mt-auto">
						<span class="font-mono text-[9px] text-ash uppercase tracking-[0.3em] block mb-2">RESTRICTED ACCESS</span>
						<p class="font-mono text-[10px] text-ash/60 uppercase tracking-widest max-w-[200px] leading-relaxed">
							ARCHIVED SILHOUETTES<br/>
							EXPERIMENTAL FABRICS<br/>
							LIMITED RELEASE
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>
{/if}
