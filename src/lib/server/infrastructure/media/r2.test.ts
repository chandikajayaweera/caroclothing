import { describe, expect, it } from 'vitest';
import { buildMediaKey, uploadImage } from './r2';
import { createFakeR2Bucket, makeImage, type FakeR2Bucket } from '../../../../tests/fakes/media';

type StoredR2Options = {
	httpMetadata?: {
		contentType?: string;
		cacheControl?: string;
	};
	customMetadata?: Record<string, string>;
};

type StoredUpload = {
	body: ArrayBuffer;
	options?: StoredR2Options;
};

function storedUpload(bucket: FakeR2Bucket, key: string): StoredUpload {
	const stored = bucket.objects.get(key);
	if (!stored) throw new Error(`Expected uploaded object at ${key}.`);
	return stored as StoredUpload;
}

describe('R2 image uploads', () => {
	it('stores the original image bytes and content type unchanged', async () => {
		const bucket = createFakeR2Bucket();
		const key = 'products/product-id/main-test.png';

		const result = await uploadImage(bucket, key, makeImage('shirt.png', 'image/png'));

		const stored = storedUpload(bucket, key);
		expect(result).toEqual({
			key,
			mimeType: 'image/png',
			byteSize: 4,
			originalFilename: 'shirt.png'
		});
		expect(Array.from(new Uint8Array(stored.body))).toEqual([137, 80, 78, 71]);
		expect(stored.options?.httpMetadata).toMatchObject({
			contentType: 'image/png',
			cacheControl: 'public, max-age=31536000, immutable'
		});
		expect(stored.options?.customMetadata).toMatchObject({
			originalName: 'shirt.png',
			mimeType: 'image/png',
			byteSize: '4'
		});
	});

	it('rejects video uploads', async () => {
		const bucket = createFakeR2Bucket();
		const file = new File([new Uint8Array([0, 0, 0, 24])], 'review.mp4', { type: 'video/mp4' });

		await expect(uploadImage(bucket, 'reviews/review-id/media-test.mp4', file)).rejects.toThrow(
			'Unsupported image type "video/mp4". Allowed: JPG, PNG, WEBP, AVIF.'
		);
	});

	it('rejects GIF uploads', async () => {
		const bucket = createFakeR2Bucket();
		const file = new File([new Uint8Array([71, 73, 70])], 'animated.gif', { type: 'image/gif' });

		await expect(uploadImage(bucket, 'reviews/review-id/media-test.gif', file)).rejects.toThrow(
			'Unsupported image type "image/gif". Allowed: JPG, PNG, WEBP, AVIF.'
		);
	});

	it('builds unique safe keys with image extensions', () => {
		const keyA = buildMediaKey({
			scope: 'products',
			entityId: 'product-id',
			variant: 'main',
			contentType: 'image/webp'
		});
		const keyB = buildMediaKey({
			scope: 'products',
			entityId: 'product-id',
			variant: 'main',
			contentType: 'image/webp'
		});

		expect(keyA).toMatch(/^products\/product-id\/main-[a-f0-9]{32}\.webp$/);
		expect(keyB).toMatch(/^products\/product-id\/main-[a-f0-9]{32}\.webp$/);
		expect(keyA).not.toBe(keyB);
	});
});
