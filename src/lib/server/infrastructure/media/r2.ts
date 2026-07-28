/**
 * R2 media helpers for image-only uploads on Cloudflare Workers.
 *
 * Wrangler generates Cloudflare runtime types in src/worker-configuration.d.ts.
 * tsconfig.json loads that file globally, so R2Bucket and R2Object stay ambient.
 */

import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { getErrorMessage } from '$lib/server/infrastructure/errors';

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

	const uid = nanoid();
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

export function isInvalidImageUploadMessage(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes('unsupported image type') ||
		normalized.includes('unsupported content type') ||
		normalized.includes('file is empty') ||
		normalized.includes('image is too large') ||
		normalized.includes('contents do not match declared image type')
	);
}

function sanitizedOriginalName(fileName: string): string {
	const sanitized = fileName
		.replace(/[^\w.\- ]/g, '_')
		.trim()
		.slice(0, 255);
	return sanitized.length > 0 ? sanitized : 'upload';
}

export async function putFile(bucket: R2Bucket, key: string, file: File): Promise<void> {
	validateImageFile(file);
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
	const bytes = await file.arrayBuffer();
	assertImageSignature(bytes, file.type);
	await bucket.put(key, bytes, {
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

function assertImageSignature(bytes: ArrayBuffer, contentType: string): void {
	const data = new Uint8Array(bytes);
	const matches =
		contentType === 'image/jpeg'
			? startsWithBytes(data, [0xff, 0xd8, 0xff])
			: contentType === 'image/png'
				? startsWithBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
				: contentType === 'image/webp'
					? hasAscii(data, 0, 'RIFF') && hasAscii(data, 8, 'WEBP')
					: contentType === 'image/avif'
						? hasAscii(data, 4, 'ftyp') && (hasAscii(data, 8, 'avif') || hasAscii(data, 8, 'avis'))
						: false;

	if (!matches) {
		throw new Error(`File contents do not match declared image type "${contentType}".`);
	}
}

function startsWithBytes(data: Uint8Array, expected: number[]): boolean {
	return expected.every((value, index) => data[index] === value);
}

function hasAscii(data: Uint8Array, offset: number, expected: string): boolean {
	if (data.length < offset + expected.length) return false;
	return [...expected].every(
		(character, index) => data[offset + index] === character.charCodeAt(0)
	);
}

export async function deleteObjectSafe(
	bucket: R2Bucket,
	key: string | null | undefined
): Promise<void> {
	if (!key) return;
	try {
		assertSafeR2Key(key);
	} catch (err) {
		console.error(`[R2] Refused unsafe cleanup key "${key}":`, {
			error: getErrorMessage(err)
		});
		return;
	}

	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			await bucket.delete(key);
			return;
		} catch (error) {
			lastError = error;
			if (attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** (attempt - 1)));
			}
		}
	}

	console.error(`[R2] deleteObjectSafe failed for key "${key}" after retries:`, {
		error: getErrorMessage(lastError)
	});
}
