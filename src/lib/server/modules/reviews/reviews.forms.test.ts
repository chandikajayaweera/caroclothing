import { describe, expect, it } from 'vitest';
import { reviewMediaFileSchema } from './reviews.forms';

describe('review media form validation', () => {
	it('accepts supported still images', () => {
		const file = new File([new Uint8Array([1, 2, 3])], 'review.webp', { type: 'image/webp' });

		expect(reviewMediaFileSchema.safeParse(file).success).toBe(true);
	});

	it('rejects videos', () => {
		const file = new File([new Uint8Array([1, 2, 3])], 'review.mp4', { type: 'video/mp4' });

		expect(reviewMediaFileSchema.safeParse(file).success).toBe(false);
	});

	it('rejects GIF images', () => {
		const file = new File([new Uint8Array([1, 2, 3])], 'review.gif', { type: 'image/gif' });

		expect(reviewMediaFileSchema.safeParse(file).success).toBe(false);
	});
});
