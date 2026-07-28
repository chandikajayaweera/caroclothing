import { describe, expect, it } from 'vitest';

const componentSources = import.meta.glob<string>(
	['/src/routes/**/*.svelte', '/src/lib/components/**/*.svelte'],
	{
		eager: true,
		query: '?raw',
		import: 'default'
	}
);

describe('async display loading-state coverage', () => {
	it('keeps persistent layouts visible instead of installing a global route skeleton', () => {
		const rootLayout = componentSources['/src/routes/+layout.svelte'];

		expect(rootLayout).toBeTypeOf('string');
		expect(rootLayout).not.toContain('NavigationSkeleton');
		expect(rootLayout).not.toContain('showNavigationSkeleton');
		expect(rootLayout).toContain('{@render children()}');
	});

	it('keeps the storefront landing route free of skeleton UI', () => {
		const homePage = componentSources['/src/routes/+page.svelte'];
		const storefrontSection = componentSources['/src/lib/components/home/StorefrontSection.svelte'];
		const heroSection = componentSources['/src/lib/components/home/HeroSection.svelte'];

		expect(homePage).not.toMatch(/SkeletonBlock|NavigationSkeleton|animate-pulse/);
		expect(heroSection).not.toMatch(/SkeletonBlock|animate-pulse/);
		expect(storefrontSection).toContain('showImageSkeleton={false}');
		expect(storefrontSection.match(/<ProgressiveImage/g)?.length).toBe(
			storefrontSection.match(/showSkeleton=\{false\}/g)?.length
		);
	});

	it('keeps primary admin route data free of route-level skeleton swaps', () => {
		const primaryAdminRoutes = [
			{
				path: '/src/routes/(protected)/app/products/+page.svelte',
				primaryStreamMarker: 'data.streamed.products'
			},
			{
				path: '/src/routes/(protected)/app/categories/+page.svelte',
				primaryStreamMarker: 'data.streamed.categories'
			},
			{
				path: '/src/routes/(protected)/app/addresses/+page.svelte',
				primaryStreamMarker: 'data.streamed.addresses'
			},
			{
				path: '/src/routes/(protected)/app/products/[productslug]/+page.svelte',
				primaryStreamMarker: 'data.streamed.product'
			}
		];

		for (const { path, primaryStreamMarker } of primaryAdminRoutes) {
			const source = componentSources[path];
			expect(source, `${path} source must be discoverable`).toBeTypeOf('string');
			expect(source, `${path} should await primary data before navigation completes`).not.toContain(
				primaryStreamMarker
			);
			expect(source, `${path} should not remount through a list skeleton`).not.toContain(
				'AdminSkeletonList'
			);
		}
	});

	it('gives every await block a local pending skeleton and recovery state', () => {
		const asyncDisplays = Object.entries(componentSources)
			.map(([path, source]) => ({ path, source }))
			.filter(({ source }) => source.includes('{#await'));

		expect(asyncDisplays.length).toBeGreaterThan(0);

		for (const { path, source } of asyncDisplays) {
			const awaitBlocks = [...source.matchAll(/\{#await[\s\S]*?\{\/await\}/g)].map(
				(match) => match[0]
			);

			for (const [index, block] of awaitBlocks.entries()) {
				const pendingMarkup = block.split('{:then', 1)[0];
				expect(pendingMarkup, `${path} await block ${index + 1} needs a pending skeleton`).toMatch(
					/SkeletonBlock|AdminSkeletonList|#snippet skeleton|animate-pulse/
				);
				expect(block, `${path} await block ${index + 1} needs an async recovery state`).toContain(
					'{:catch'
				);
			}
		}
	});

	it('keeps client-fetched display data behind skeleton or stale-data boundaries', () => {
		const displayBoundaries = [
			{
				path: 'src/lib/components/layout/WishlistDrawer.svelte',
				evidence: ['isLoading', 'SkeletonBlock']
			},
			{
				path: 'src/lib/components/product/ProductVariantAvailabilitySync.svelte',
				evidence: ['availability:', 'onAvailability']
			},
			{
				path: 'src/routes/(protected)/checkout/+page.svelte',
				evidence: ['isLoadingShipping', 'SkeletonBlock']
			}
		];

		for (const boundary of displayBoundaries) {
			const source = componentSources[`/${boundary.path}`];
			expect(source, `${boundary.path} source must be discoverable`).toBeTypeOf('string');
			expect(source, `${boundary.path} must remain a client data boundary`).toContain('fetch(');
			for (const marker of boundary.evidence) {
				expect(source, `${boundary.path} lost loading-state evidence: ${marker}`).toContain(marker);
			}
		}
	});
});
