<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';

	let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		transition:fade={{ duration: 200 }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="size-guide-title"
	>
		<button
			type="button"
			class="absolute inset-0 cursor-default bg-void/80 backdrop-blur-md"
			onclick={onClose}
			aria-label="Close size guide"
		></button>

		<div
			class="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col gap-6 overflow-y-auto border border-ash/10 bg-charcoal p-6 md:p-8"
			transition:fly={{ y: 20, duration: 300 }}
			role="document"
		>
			<button
				type="button"
				onclick={onClose}
				class="absolute top-4 right-4 cursor-pointer p-1 text-ash transition-colors hover:text-volt"
				aria-label="Close modal"
			>
				<X size={20} strokeWidth={1.5} aria-hidden="true" />
			</button>

			<div>
				<h2 id="size-guide-title" class="font-display text-3xl tracking-wide text-bone uppercase">
					Size Guide
				</h2>
				<p class="mt-1 font-mono text-[10px] tracking-widest text-volt uppercase">
					Streetwear Fit Chart
				</p>
			</div>

			<div class="border-l-2 border-volt bg-void/30 py-1 pl-3">
				<p class="font-sans text-xs leading-relaxed text-bone/90">
					All Caro streetwear garments feature an <strong class="text-volt"
						>oversized, relaxed fit</strong
					> with dropped shoulders. For a standard fit, we recommend ordering one size down.
				</p>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full border-collapse text-left font-mono text-xs">
					<thead>
						<tr class="border-b border-ash/15 text-[10px] tracking-wider text-ash uppercase">
							<th class="py-2.5">Size</th>
							<th class="py-2.5 text-center">Chest (in)</th>
							<th class="py-2.5 text-center">Length (in)</th>
							<th class="py-2.5 text-center">Shoulder (in)</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-ash/5 text-bone">
						<tr class="transition-colors hover:bg-void/20">
							<td class="py-3 font-bold text-volt">S</td>
							<td class="py-3 text-center">44</td>
							<td class="py-3 text-center">28</td>
							<td class="py-3 text-center">19</td>
						</tr>
						<tr class="transition-colors hover:bg-void/20">
							<td class="py-3 font-bold text-volt">M</td>
							<td class="py-3 text-center">46</td>
							<td class="py-3 text-center">29</td>
							<td class="py-3 text-center">20</td>
						</tr>
						<tr class="transition-colors hover:bg-void/20">
							<td class="py-3 font-bold text-volt">L</td>
							<td class="py-3 text-center">48</td>
							<td class="py-3 text-center">30</td>
							<td class="py-3 text-center">21</td>
						</tr>
						<tr class="transition-colors hover:bg-void/20">
							<td class="py-3 font-bold text-volt">XL</td>
							<td class="py-3 text-center">50</td>
							<td class="py-3 text-center">31</td>
							<td class="py-3 text-center">22</td>
						</tr>
						<tr class="transition-colors hover:bg-void/20">
							<td class="py-3 font-bold text-volt">XXL</td>
							<td class="py-3 text-center">52</td>
							<td class="py-3 text-center">32</td>
							<td class="py-3 text-center">23</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div class="space-y-3 border-t border-ash/10 pt-2">
				<h3 class="font-mono text-[10px] font-bold tracking-widest text-ash uppercase">
					How to Measure
				</h3>
				<ul class="list-inside list-disc space-y-2 font-sans text-xs text-ash/80">
					<li>
						<strong class="text-bone">Chest:</strong> Measure around the fullest part of your chest, keeping
						the tape horizontal.
					</li>
					<li>
						<strong class="text-bone">Length:</strong> Measure from the highest point of the shoulder
						down to the hem.
					</li>
					<li>
						<strong class="text-bone">Shoulder:</strong> Measure straight across from one shoulder point
						to the other.
					</li>
				</ul>
			</div>
		</div>
	</div>
{/if}
