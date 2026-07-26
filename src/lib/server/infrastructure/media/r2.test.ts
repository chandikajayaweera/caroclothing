import { describe, expect, it, vi } from 'vitest';
import { buildMediaKey, deleteObjectSafe, uploadImage } from './r2';
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
			byteSize: 8,
			originalFilename: 'shirt.png'
		});
		expect(Array.from(new Uint8Array(stored.body))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(stored.options?.httpMetadata).toMatchObject({
			contentType: 'image/png',
			cacheControl: 'public, max-age=31536000, immutable'
		});
		expect(stored.options?.customMetadata).toMatchObject({
			originalName: 'shirt.png',
			mimeType: 'image/png',
			byteSize: '8'
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

	it('rejects files whose bytes do not match the declared image type', async () => {
		const bucket = createFakeR2Bucket();
		const file = new File([new TextEncoder().encode('<script>alert(1)</script>')], 'fake.png', {
			type: 'image/png'
		});

		await expect(uploadImage(bucket, 'reviews/review-id/media-test.png', file)).rejects.toThrow(
			'File contents do not match declared image type "image/png".'
		);
		expect(bucket.putCalls).toHaveLength(0);
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

		expect(keyA).toMatch(/^products\/product-id\/main-[A-Za-z0-9_-]{21}\.webp$/);
		expect(keyB).toMatch(/^products\/product-id\/main-[A-Za-z0-9_-]{21}\.webp$/);
		expect(keyA).not.toBe(keyB);
	});

	it('keeps cleanup best-effort when a persisted key is invalid', async () => {
		const bucket = createFakeR2Bucket();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await expect(deleteObjectSafe(bucket, '../unsafe.png')).resolves.toBeUndefined();

		expect(bucket.deleteCalls).toHaveLength(0);
		expect(consoleError).toHaveBeenCalledOnce();
		consoleError.mockRestore();
	});

	it('retries idempotent R2 deletion after transient failures', async () => {
		const bucket = createFakeR2Bucket();
		let attempts = 0;
		bucket.delete = vi.fn(async (key: string) => {
			attempts += 1;
			if (attempts < 3) throw new Error('Transient R2 failure');
			bucket.deleteCalls.push(key);
			bucket.objects.delete(key);
		});

		await expect(
			deleteObjectSafe(bucket, 'products/product-id/image.png')
		).resolves.toBeUndefined();
		expect(attempts).toBe(3);
		expect(bucket.deleteCalls).toEqual(['products/product-id/image.png']);
	});
});
