/**
 * R2 media helpers for image-only uploads on Cloudflare Workers.
 *
 * Wrangler generates Cloudflare runtime types in src/worker-configuration.d.ts.
 * tsconfig.json loads that file globally, so R2Bucket and R2Object stay ambient.
 */

import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export const ALLOWED_IMAGE_TYPES = new Set<string>([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif'
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const SAFE_KEY_RE = /^[a-zA-Z0-9_\-./]+$/;
const SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;

export type MediaScope = 'categories' | 'products' | 'reviews' | 'banners';

export type StoredImageMetadata = {
	key: string;
	mimeType: string;
	byteSize: number;
	originalFilename: string | null;
};

export function getMediaBucketOptional(event: Pick<RequestEvent, 'platform'>): R2Bucket | null {
	return event.platform?.env?.MEDIA ?? null;
}

export function getMediaBucket(event: Pick<RequestEvent, 'platform'>): R2Bucket {
	const bucket = getMediaBucketOptional(event);
	if (!bucket) throw error(500, 'R2 bucket binding "MEDIA" is not configured.');
	return bucket;
}

export function assertSafeR2Key(key: string): void {
	if (!key || !SAFE_KEY_RE.test(key) || key.includes('..') || key.startsWith('/')) {
		throw new Error(`Unsafe R2 key rejected: "${key}"`);
	}
}

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif'
};

function extFromContentType(contentType: string): string {
	return CONTENT_TYPE_TO_EXT[contentType] ?? 'bin';
}

export function buildMediaKey(opts: {
	scope: MediaScope;
	entityId: string;
	variant: string;
	contentType: string;
}): string {
	if (!SEGMENT_RE.test(opts.entityId)) {
		throw new Error(
			`Invalid entityId "${opts.entityId}": only alphanumeric, hyphens, and underscores allowed.`
		);
	}
	if (!SEGMENT_RE.test(opts.variant)) {
		throw new Error(
			`Invalid variant "${opts.variant}": only alphanumeric, hyphens, and underscores allowed.`
		);
	}

	const ext = extFromContentType(opts.contentType);
	if (ext === 'bin') throw new Error(`Unsupported content type "${opts.contentType}".`);

	const uid = crypto.randomUUID().replace(/-/g, '');
	return `${opts.scope}/${opts.entityId}/${opts.variant}-${uid}.${ext}`;
}

export function validateImageFile(file: File): void {
	if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
		throw new Error(`Unsupported image type "${file.type}". Allowed: JPG, PNG, WEBP, AVIF.`);
	}
	if (file.size <= 0) throw new Error('The file is empty.');
	if (file.size > MAX_IMAGE_BYTES) {
		const mb = (file.size / 1024 / 1024).toFixed(1);
		throw new Error(`Image is too large (${mb} MB). Maximum allowed size is 5 MB.`);
	}
}

function sanitizedOriginalName(fileName: string): string {
	const sanitized = fileName
		.replace(/[^\w.\- ]/g, '_')
		.trim()
		.slice(0, 255);
	return sanitized.length > 0 ? sanitized : 'upload';
}

export async function putFile(bucket: R2Bucket, key: string, file: File): Promise<void> {
	assertSafeR2Key(key);
	await putOriginalImage(bucket, key, file);
}

export async function uploadImage(
	bucket: R2Bucket,
	key: string,
	file: File
): Promise<StoredImageMetadata> {
	validateImageFile(file);
	assertSafeR2Key(key);
	await putOriginalImage(bucket, key, file);

	return {
		key,
		mimeType: file.type,
		byteSize: file.size,
		originalFilename: sanitizedOriginalName(file.name)
	};
}

async function putOriginalImage(bucket: R2Bucket, key: string, file: File): Promise<void> {
	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: {
			contentType: file.type,
			cacheControl: 'public, max-age=31536000, immutable'
		},
		customMetadata: {
			originalName: sanitizedOriginalName(file.name),
			mimeType: file.type,
			byteSize: String(file.size)
		}
	});
}

export async function deleteObjectSafe(
	bucket: R2Bucket,
	key: string | null | undefined
): Promise<void> {
	if (!key) return;
	assertSafeR2Key(key);
	try {
		await bucket.delete(key);
	} catch (err) {
		console.error(`[R2] deleteObjectSafe failed for key "${key}":`, err);
	}
}
