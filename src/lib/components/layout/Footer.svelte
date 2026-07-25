<script lang="ts">
	import { resolve } from '$app/paths';

	const tagline = 'WEAR THE NEXT GENERATION';
	const columns = [
		{
			heading: 'Shop',
			links: [
				{ label: 'New In', href: '/shop?sort=new' },
				{ label: 'Men', href: '/shop?gender=men' },
				{ label: 'Women', href: '/shop?gender=women' },
				{ label: 'Wishlist', href: '/wishlist' }
			]
		},
		{
			heading: 'Info',
			links: [
				{ label: 'About', href: '/about' },
				{ label: 'Shipping', href: '/shipping' },
				{ label: 'Returns', href: '/returns' },
				{ label: 'Contact', href: '/contact' }
			]
		}
	];
	const social = [
		{ label: 'Instagram', href: 'https://instagram.com/caroapparel', icon: 'instagram' },
		{ label: 'TikTok', href: 'https://tiktok.com/@caroapparel', icon: 'tiktok' }
	];
	const copyright = `© ${new Date().getFullYear()} Caro Clothing. Sri Lanka.`;

	let activeMobileColumn = $state<string | null>(null);

	function toggleColumn(heading: string) {
		activeMobileColumn = activeMobileColumn === heading ? null : heading;
	}
</script>

<footer class="bg-charcoal px-5 pt-12 pb-8 md:px-8 md:py-16 lg:px-12">
	<div class="mx-auto max-w-7xl">
		<!-- Tablet/Desktop Grid -->
		<div class="mb-12 hidden grid-cols-4 gap-8 md:grid">
			<!-- Col 1 -->
			<div class="md:col-span-2 lg:col-span-1">
				<span class="mb-6 block font-display text-4xl tracking-[0.2em] text-bone">CARO</span>
				<p class="mb-6 min-w-50 font-display text-4xl leading-tight text-bone">{tagline}</p>
				<div class="flex gap-4">
					{#each social as item (item.href)}
						<button
							type="button"
							onclick={() => window.open(item.href, '_blank', 'noopener,noreferrer')}
							class="text-ash transition-colors hover:text-volt"
							aria-label={item.label}
						>
							{#if item.icon === 'instagram'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-instagram"
								>
									<rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
									<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
									<line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
								</svg>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="lucide lucide-music"
								>
									<path d="M9 18V5l12-2v13" />
									<circle cx="6" cy="18" r="3" />
									<circle cx="18" cy="16" r="3" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<!-- Col 2 & 3 -->
			{#each columns as column (column.heading)}
				<div>
					<h3 class="mb-6 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">
						{column.heading}
					</h3>
					<div class="flex flex-col gap-3">
						{#each column.links as link (link.href)}
							<a
								href={resolve(link.href as '/')}
								class="font-mono text-[10px] tracking-[0.15em] text-ash uppercase transition-colors hover:text-bone"
							>
								{link.label}
							</a>
						{/each}
					</div>
				</div>
			{/each}

			<!-- Col 4 -->
			<div>
				<h3 class="mb-6 font-mono text-[10px] tracking-[0.2em] text-ash uppercase">Legal</h3>
				<div class="flex flex-col gap-3">
					<a
						href={resolve('/privacy' as '/')}
						class="font-mono text-[10px] tracking-[0.15em] text-ash uppercase transition-colors hover:text-bone"
					>
						Privacy
					</a>
					<a
						href={resolve('/terms' as '/')}
						class="font-mono text-[10px] tracking-[0.15em] text-ash uppercase transition-colors hover:text-bone"
					>
						Terms
					</a>
					<p class="mt-4 font-mono text-[10px] text-ash/50">{copyright}</p>
				</div>
			</div>
		</div>

		<!-- Mobile Stacked Accordions -->
		<div class="md:hidden">
			<p class="mb-8 font-display text-4xl leading-tight text-bone">{tagline}</p>

			<div class="border-t border-void/40">
				{#each columns as column (column.heading)}
					<div class="border-b border-void/40">
						<button
							class="flex w-full items-center justify-between py-4 font-mono text-[10px] tracking-[0.2em] text-ash uppercase"
							onclick={() => toggleColumn(column.heading)}
						>
							{column.heading}
							<span>{activeMobileColumn === column.heading ? '–' : '+'}</span>
						</button>
						{#if activeMobileColumn === column.heading}
							<div class="flex flex-col gap-2 pb-4">
								{#each column.links as link (link.href)}
									<a
										href={resolve(link.href as '/')}
										class="block py-1 font-mono text-xs text-ash hover:text-bone"
									>
										{link.label}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="mt-8 flex gap-4">
				{#each social as item (item.href)}
					<button
						type="button"
						onclick={() => window.open(item.href, '_blank', 'noopener,noreferrer')}
						class="text-ash transition-colors hover:text-volt"
						aria-label={item.label}
					>
						{#if item.icon === 'instagram'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-instagram"
							>
								<rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
								<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
								<line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-music"
							>
								<path d="M9 18V5l12-2v13" />
								<circle cx="6" cy="18" r="3" />
								<circle cx="18" cy="16" r="3" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>

			<p class="mt-8 font-mono text-[10px] text-ash/50">{copyright}</p>
		</div>
	</div>
</footer>
