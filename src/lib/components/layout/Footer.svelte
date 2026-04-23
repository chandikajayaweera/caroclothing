<script lang="ts">
	const tagline = 'WEAR THE NEXT GENERATION';
	const columns = [
		{
			heading: 'Shop',
			links: [
				{ label: 'New In', href: '/shop?sort=new' },
				{ label: 'Men', href: '/shop?gender=men' },
				{ label: 'Women', href: '/shop?gender=women' },
				{ label: 'All', href: '/shop' }
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

<footer class="bg-charcoal pt-12 pb-8 md:py-16 px-5 md:px-8 lg:px-12">
	<div class="max-w-7xl mx-auto">
		<!-- Tablet/Desktop Grid -->
		<div class="hidden md:grid grid-cols-4 gap-8 mb-12">
			<!-- Col 1 -->
			<div class="md:col-span-2 lg:col-span-1">
				<span class="font-display text-4xl text-bone tracking-[0.2em] mb-6 block">CARO</span>
				<p class="font-display text-4xl text-bone mb-6 leading-tight max-w-[200px]">{tagline}</p>
				<div class="flex gap-4">
					{#each social as item}
						<a href={item.href} class="text-ash hover:text-volt transition-colors" aria-label={item.label}>
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
						</a>
					{/each}
				</div>
			</div>

			<!-- Col 2 & 3 -->
			{#each columns as column}
				<div>
					<h3 class="font-mono text-[10px] uppercase tracking-[0.2em] text-ash mb-6">
						{column.heading}
					</h3>
					<div class="flex flex-col gap-3">
						{#each column.links as link}
							<a
								href={link.href}
								class="font-mono text-[10px] uppercase tracking-[0.15em] text-ash hover:text-bone transition-colors"
							>
								{link.label}
							</a>
						{/each}
					</div>
				</div>
			{/each}

			<!-- Col 4 -->
			<div>
				<h3 class="font-mono text-[10px] uppercase tracking-[0.2em] text-ash mb-6">Legal</h3>
				<div class="flex flex-col gap-3">
					<a
						href="/privacy"
						class="font-mono text-[10px] uppercase tracking-[0.15em] text-ash hover:text-bone transition-colors"
					>
						Privacy
					</a>
					<a
						href="/terms"
						class="font-mono text-[10px] uppercase tracking-[0.15em] text-ash hover:text-bone transition-colors"
					>
						Terms
					</a>
					<p class="font-mono text-[10px] text-ash/50 mt-4">{copyright}</p>
				</div>
			</div>
		</div>

		<!-- Mobile Stacked Accordions -->
		<div class="md:hidden">
			<p class="font-display text-4xl text-bone mb-8 leading-tight">{tagline}</p>

			<div class="border-t border-void/40">
				{#each columns as column}
					<div class="border-b border-void/40">
						<button
							class="w-full py-4 flex justify-between items-center font-mono text-[10px] uppercase tracking-[0.2em] text-ash"
							onclick={() => toggleColumn(column.heading)}
						>
							{column.heading}
							<span>{activeMobileColumn === column.heading ? '–' : '+'}</span>
						</button>
						{#if activeMobileColumn === column.heading}
							<div class="pb-4 flex flex-col gap-2">
								{#each column.links as link}
									<a
										href={link.href}
										class="font-mono text-xs text-ash hover:text-bone py-1 block"
									>
										{link.label}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="flex gap-4 mt-8">
				{#each social as item}
					<a href={item.href} class="text-ash hover:text-volt transition-colors" aria-label={item.label}>
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
					</a>
				{/each}
			</div>

			<p class="font-mono text-[10px] text-ash/50 mt-8">{copyright}</p>
		</div>
	</div>
</footer>
