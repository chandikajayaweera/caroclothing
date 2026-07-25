import { describe, expect, it } from 'vitest';
import {
	isMediaImagePreset,
	mediaOriginalUrl,
	mediaPresetUrl,
	mediaSrcset,
	productCardImageAttrs,
	productDetailImageAttrs
} from './media';

describe('media URL helpers', () => {
	it('builds encoded original and preset URLs', () => {
		const key = 'products/product-id/main test.png';

		expect(mediaOriginalUrl(key)).toBe('/media/products/product-id/main%20test.png');
		expect(mediaPresetUrl(key, 'card600')).toBe(
			'/media/_preset/card600/products/product-id/main%20test.png'
		);
	});

	it('validates fixed preset names only', () => {
		expect(isMediaImagePreset('card600')).toBe(true);
		expect(isMediaImagePreset('width=9999')).toBe(false);
	});

	it('builds bounded srcsets', () => {
		expect(mediaSrcset('products/p/main-a.webp', ['card400', 'card600', 'card800'])).toBe(
			'/media/_preset/card400/products/p/main-a.webp 400w, /media/_preset/card600/products/p/main-a.webp 600w, /media/_preset/card800/products/p/main-a.webp 800w'
		);
	});

	it('returns product card and detail display attrs', () => {
		const card = productCardImageAttrs({ r2Key: 'products/p/main-a.webp' });
		const detail = productDetailImageAttrs({ r2Key: 'products/p/main-a.webp' }, { priority: true });

		expect(card?.src).toBe('/media/_preset/card600/products/p/main-a.webp');
		expect(card?.srcset).toContain('card400');
		expect(card?.width).toBe(600);
		expect(card?.height).toBe(800);
		expect(detail?.src).toBe('/media/_preset/product800/products/p/main-a.webp');
		expect(detail?.srcset).toContain('product1200');
		expect(detail?.fetchpriority).toBe('high');
	});
});
