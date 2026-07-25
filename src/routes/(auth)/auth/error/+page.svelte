<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/Button.svelte';
	import { AlertTriangle, Mail, ArrowLeft } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
	const error = $derived(data.error);
</script>

<svelte:head>
	<title>{error.appealSupport ? 'Access Suspended' : 'Authentication Error'} | Caro Clothing</title>
	<meta name="description" content={error.message} />
</svelte:head>

<div class="relative grid min-h-screen overflow-hidden bg-void md:grid-cols-2">
	<!-- Left Side: Editorial Image -->
	<div class="relative hidden overflow-hidden border-r border-charcoal md:block">
		<img
			src="/images/editorial.jpg"
			alt="Caro Clothing Editorial"
			class="absolute inset-0 h-full w-full object-cover opacity-50 grayscale"
		/>
		<div class="absolute inset-0 bg-void/40"></div>
		<div class="absolute bottom-20 left-20 z-10 max-w-md">
			<h1 class="font-bebas mb-8 text-8xl leading-none tracking-tighter text-bone">
				THE NEXT<br />GEN.
			</h1>
			<p class="font-mono text-xs leading-relaxed tracking-[0.3em] text-ash/80 uppercase">
				Join the inner circle. Get early access to new arrivals. Raw style. No suggestions.
			</p>
		</div>
	</div>

	<!-- Right Side: Error Content -->
	<div class="relative flex flex-col items-center justify-center px-6 sm:px-12 lg:px-24">
		<div class="mx-auto w-full max-w-sm space-y-12">
			<!-- Header -->
			<div class="space-y-4 text-center">
				<a href={resolve('/')} class="font-bebas text-4xl tracking-[0.2em] text-bone">CARO</a>
				{#if error.appealSupport}
					<h2 class="font-bebas text-5xl tracking-tight text-red-500 uppercase">Suspended</h2>
				{:else}
					<h2 class="font-bebas text-5xl tracking-tight text-bone uppercase">Auth Error</h2>
				{/if}
			</div>

			<!-- Error Card -->
			<div class="space-y-6">
				<div class="rounded-xs border border-red-500/20 bg-red-500/5 p-6 text-center" role="alert">
					<div class="mb-4 flex justify-center text-red-500">
						<AlertTriangle size={36} />
					</div>
					<p class="font-mono text-[10px] font-bold tracking-widest text-red-500 uppercase">
						{error.code}
					</p>
					<p class="mt-3 font-sans text-sm leading-relaxed whitespace-pre-line text-ash">
						{error.message}
					</p>
				</div>

				<!-- Actions -->
				<div class="space-y-4 pt-4">
					{#if error.appealSupport}
						<a
							href="mailto:support@caroclothing.lk?subject=Appeal%20Account%20Suspension"
							class="flex w-full items-center justify-center gap-2 border border-volt bg-volt py-4 font-mono text-[10px] font-bold tracking-[0.2em] text-void uppercase transition-colors hover:border-bone hover:bg-bone"
						>
							<Mail size={12} /> Contact Support
						</a>
					{:else}
						<Button
							variant="primary"
							class="h-14 w-full text-sm font-bold tracking-[0.15em]"
							onclick={() => (window.location.href = resolve('/sign-in'))}
						>
							Try Signing In Again
						</Button>
					{/if}

					<a
						href={resolve('/')}
						class="flex w-full items-center justify-center gap-2 border border-charcoal bg-charcoal/30 py-4 font-mono text-[10px] tracking-[0.2em] text-ash uppercase transition-colors hover:border-volt hover:text-bone"
					>
						<ArrowLeft size={12} /> Go to Storefront
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	a {
		touch-action: manipulation;
	}
</style>
