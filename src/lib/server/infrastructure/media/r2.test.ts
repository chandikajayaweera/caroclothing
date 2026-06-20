import { describe, expect, it, vi } from 'vitest';
import { uploadImage, uploadMedia } from './r2';
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

function makeVideo(name = 'review.mp4', type = 'video/mp4'): File {
	return new File([new Uint8Array([0, 0, 0, 24])], name, { type });
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes);
	return copy.buffer as ArrayBuffer;
}

function createImagesBinding(
	options: {
		bytes?: Uint8Array;
		contentType?: string;
		fail?: boolean;
	} = {}
) {
	const bytes = options.bytes ?? new Uint8Array([1, 2, 3]);
	const contentType = options.contentType ?? 'image/webp';
	const transformer = {} as ImageTransformer;
	const transform = vi.fn(() => transformer);
	const draw = vi.fn(() => transformer);
	const output = vi.fn(async () => {
		if (options.fail) throw new Error('Transform failed.');

		return {
			response: () =>
				new Response(bytesToArrayBuffer(bytes), {
					headers: { 'Content-Type': contentType }
				}),
			contentType: () => contentType,
			image: () => new Response(bytesToArrayBuffer(bytes)).body as ReadableStream<Uint8Array>
		};
	});

	Object.assign(transformer, { transform, draw, output });

	const binding = {
		input: vi.fn(() => transformer),
		info: vi.fn(),
		hosted: {} as HostedImagesBinding
	} satisfies ImagesBinding;

	return { binding, transform, output };
}

describe('R2 media uploads', () => {
	it('optimizes uploaded images when an Images binding is provided', async () => {
		const bucket = createFakeR2Bucket();
		const key = 'products/product-id/main-test.png';
		const { binding, transform, output } = createImagesBinding({
			bytes: new Uint8Array([10, 20, 30])
		});

		await uploadImage(bucket, key, makeImage('shirt.png', 'image/png'), {
			images: binding,
			profile: 'product'
		});

		expect(binding.input).toHaveBeenCalledTimes(1);
		expect(transform).toHaveBeenCalledWith({ width: 1600, fit: 'scale-down' });
		expect(output).toHaveBeenCalledWith({ format: 'image/webp', quality: 82 });

		const stored = storedUpload(bucket, key);
		expect(Array.from(new Uint8Array(stored.body))).toEqual([10, 20, 30]);
		expect(stored.options?.httpMetadata?.contentType).toBe('image/webp');
		expect(stored.options?.customMetadata).toMatchObject({
			originalName: 'shirt.png',
			sourceContentType: 'image/png',
			optimized: 'true'
		});
	});

	it('uploads the original image when no Images binding is provided', async () => {
		const bucket = createFakeR2Bucket();
		const key = 'products/product-id/main-test.png';

		await uploadImage(bucket, key, makeImage('shirt.png', 'image/png'));

		const stored = storedUpload(bucket, key);
		expect(Array.from(new Uint8Array(stored.body))).toEqual([137, 80, 78, 71]);
		expect(stored.options?.httpMetadata?.contentType).toBe('image/png');
		expect(stored.options?.customMetadata).toMatchObject({
			sourceContentType: 'image/png',
			optimized: 'false'
		});
	});

	it('falls back to the original image when optimization fails', async () => {
		const bucket = createFakeR2Bucket();
		const key = 'reviews/review-id/media-0-test.png';
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const { binding } = createImagesBinding({ fail: true });

		await uploadImage(bucket, key, makeImage('review.png', 'image/png'), {
			images: binding,
			profile: 'review'
		});

		const stored = storedUpload(bucket, key);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('[Media] image optimization failed'),
			expect.any(Error)
		);
		expect(Array.from(new Uint8Array(stored.body))).toEqual([137, 80, 78, 71]);
		expect(stored.options?.httpMetadata?.contentType).toBe('image/png');
		expect(stored.options?.customMetadata?.optimized).toBe('false');
	});

	it('does not transform uploaded videos', async () => {
		const bucket = createFakeR2Bucket();
		const key = 'reviews/review-id/media-0-test.mp4';
		const { binding } = createImagesBinding();

		const result = await uploadMedia(bucket, key, makeVideo(), {
			images: binding,
			profile: 'review'
		});

		expect(binding.input).not.toHaveBeenCalled();
		expect(result).toEqual({ key, mediaType: 'video' });

		const stored = storedUpload(bucket, key);
		expect(Array.from(new Uint8Array(stored.body))).toEqual([0, 0, 0, 24]);
		expect(stored.options?.httpMetadata?.contentType).toBe('video/mp4');
		expect(stored.options?.customMetadata?.optimized).toBe('false');
	});
});
