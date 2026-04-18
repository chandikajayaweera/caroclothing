/**
 * R2 media helpers for Cloudflare Workers.
 *
 * Prerequisites
 * ─────────────
 * 1. `@cloudflare/workers-types` installed as a devDependency.
 * 2. tsconfig.json includes `@cloudflare/workers-types` in its `types` array.
 *    This makes R2Bucket, R2Object, etc. available as ambient globals — no
 *    import is needed or wanted in this file.
 * 3. src/app.d.ts declares App.Platform using the global R2Bucket (no import).
 *
 * ⚠️  Do NOT `import type { R2Bucket } from '@cloudflare/workers-types'` in this
 * file. An explicit import creates a module-scoped type that TypeScript treats as
 * structurally distinct from the global — the two copies diverge on `Headers.getAll`,
 * causing TS2345 at any call site that mixes them. The global (tsconfig `types` array)
 * is the single source of truth for all Cloudflare workers types across the project.
 */

import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

// ── Constants ──────────────────────────────────────────────────────────────

export const ALLOWED_IMAGE_TYPES = new Set<string>([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif'
]);

export const ALLOWED_VIDEO_TYPES = new Set<string>(['video/mp4', 'video/webm']);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; //  5 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Allowlist regex: only alphanumeric, hyphens, underscores, dots, and
 * forward-slashes. Rejects anything that could enable path traversal.
 */
const SAFE_KEY_RE = /^[a-zA-Z0-9_\-./]+$/;
const SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;

// ── Types ──────────────────────────────────────────────────────────────────

export type MediaScope = 'categories' | 'products' | 'reviews' | 'banners';
export type MediaType = 'photo' | 'video';

// ── Bucket access ──────────────────────────────────────────────────────────

/**
 * Returns the R2 bucket, or null if the binding is absent (e.g. local dev
 * without a wrangler binding configured).
 */
export function getMediaBucketOptional(event: Pick<RequestEvent, 'platform'>): R2Bucket | null {
	return event.platform?.env?.MEDIA ?? null;
}

/**
 * Returns the R2 bucket, or throws HTTP 500 if the binding is missing.
 */
export function getMediaBucket(event: Pick<RequestEvent, 'platform'>): R2Bucket {
	const bucket = getMediaBucketOptional(event);
	if (!bucket) throw error(500, 'R2 bucket binding "MEDIA" is not configured.');
	return bucket;
}

// ── Key helpers ────────────────────────────────────────────────────────────

/**
 * Throws if the key contains path-traversal or characters outside the
 * safe allowlist. Call on every key that originates from user input or a URL param.
 */
export function assertSafeR2Key(key: string): void {
	if (!key || !SAFE_KEY_RE.test(key) || key.includes('..') || key.startsWith('/')) {
		throw new Error(`Unsafe R2 key rejected: "${key}"`);
	}
}

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif',
	'video/mp4': 'mp4',
	'video/webm': 'webm'
};

function extFromContentType(contentType: string): string {
	return CONTENT_TYPE_TO_EXT[contentType] ?? 'bin';
}

/**
 * Builds a deterministic, unique, safe R2 key.
 *
 * Format: `{scope}/{entityId}/{variant}-{uuid}.{ext}`
 *
 * Uses `crypto.randomUUID()` for collision-free uniqueness even under
 * high concurrency.
 */
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

	if (ext === 'bin') {
		throw new Error(`Unsupported content type "${opts.contentType}".`);
	}

	const uid = crypto.randomUUID().replace(/-/g, '');

	return `${opts.scope}/${opts.entityId}/${opts.variant}-${uid}.${ext}`;
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Returns the MediaType for a given MIME type, or null if unsupported. */
export function getMediaType(mimeType: string): MediaType | null {
	if (ALLOWED_IMAGE_TYPES.has(mimeType)) return 'photo';
	if (ALLOWED_VIDEO_TYPES.has(mimeType)) return 'video';
	return null;
}

/** Throws a descriptive Error if the file is not an acceptable image. */
export function validateImageFile(file: File): void {
	if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
		throw new Error(`Unsupported image type "${file.type}". Allowed: JPG, PNG, WEBP, AVIF, GIF.`);
	}
	if (file.size <= 0) throw new Error('The file is empty.');
	if (file.size > MAX_IMAGE_BYTES) {
		const mb = (file.size / 1024 / 1024).toFixed(1);
		throw new Error(`Image is too large (${mb} MB). Maximum allowed size is 5 MB.`);
	}
}

/**
 * Throws a descriptive Error if the file is not an acceptable image or video.
 * Returns the resolved MediaType on success.
 */
export function validateMediaFile(file: File): MediaType {
	const mediaType = getMediaType(file.type);
	if (!mediaType) {
		throw new Error(
			`Unsupported file type "${file.type}". ` +
				'Allowed images: JPG, PNG, WEBP, AVIF, GIF. Allowed videos: MP4, WEBM.'
		);
	}
	if (file.size <= 0) throw new Error('The file is empty.');
	const maxBytes = mediaType === 'photo' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
	if (file.size > maxBytes) {
		const mb = (file.size / 1024 / 1024).toFixed(1);
		const maxMB = maxBytes / 1024 / 1024;
		throw new Error(
			`File is too large (${mb} MB). Maximum allowed size for ` +
				`${mediaType === 'photo' ? 'images' : 'videos'} is ${maxMB} MB.`
		);
	}
	return mediaType;
}

// ── Low-level R2 primitives ────────────────────────────────────────────────

/** Shared low-level put — call only after validation and key assertion. */
export async function putFile(bucket: R2Bucket, key: string, file: File): Promise<void> {
	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: {
			contentType: file.type,
			cacheControl: 'public, max-age=31536000, immutable'
		},
		customMetadata: {
			// Sanitize: strip non-printable / special characters, cap length.
			originalName: file.name.replace(/[^\w.\- ]/g, '_').slice(0, 255)
		}
	});
}

/**
 * Validates and uploads an image file to R2.
 * Returns the stored key on success.
 */
export async function uploadImage(bucket: R2Bucket, key: string, file: File): Promise<void> {
	validateImageFile(file);
	assertSafeR2Key(key);
	await putFile(bucket, key, file);
}

/**
 * Validates and uploads an image or video file to R2.
 * Returns the stored key and resolved MediaType on success.
 */
export async function uploadMedia(
	bucket: R2Bucket,
	key: string,
	file: File
): Promise<{ key: string; mediaType: MediaType }> {
	const mediaType = validateMediaFile(file);
	assertSafeR2Key(key);
	await putFile(bucket, key, file);
	return { key, mediaType };
}

/**
 * Deletes a key from R2.
 * Safe to call with a null/undefined key and silently swallows errors
 * (e.g. the object no longer exists).
 */
export async function deleteObjectSafe(
	bucket: R2Bucket,
	key: string | null | undefined
): Promise<void> {
	if (!key) return;
	assertSafeR2Key(key);
	try {
		await bucket.delete(key);
	} catch {
		// Best-effort: non-fatal if the object is already gone.
	}
}
