import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES } from '$lib/server/infrastructure/media/r2';
import { createStorefrontSectionFormSchema } from './storefront.forms';

const baseInput = {
	type: 'hero',
	adminName: 'Homepage hero',
	layoutVariant: 'full_bleed',
	sourceType: 'manual'
} as const;

describe('storefront media form validation', () => {
	it('accepts a supported still image', () => {
		const desktopImage = new File([new Uint8Array([1, 2, 3])], 'hero.webp', {
			type: 'image/webp'
		});

		expect(
			createStorefrontSectionFormSchema.safeParse({ ...baseInput, desktopImage }).success
		).toBe(true);
	});

	it('rejects unsupported iPhone image types before the upload service runs', () => {
		const desktopImage = new File([new Uint8Array([1, 2, 3])], 'hero.heic', {
			type: 'image/heic'
		});
		const result = createStorefrontSectionFormSchema.safeParse({ ...baseInput, desktopImage });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						path: ['desktopImage'],
						message: 'Unsupported image type.'
					})
				])
			);
		}
	});

	it('rejects oversized images before the upload service runs', () => {
		const mobileImage = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'hero.jpg', {
			type: 'image/jpeg'
		});
		const result = createStorefrontSectionFormSchema.safeParse({ ...baseInput, mobileImage });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						path: ['mobileImage'],
						message: 'Image must be 5MB or less.'
					})
				])
			);
		}
	});
});
