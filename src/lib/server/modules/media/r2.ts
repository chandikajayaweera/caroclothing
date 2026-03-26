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
 * file, and do NOT import it in app.d.ts either. An explicit import creates a
 * module-scoped type that TypeScript treats as structurally distinct from the
 * global — the two copies diverge on `Headers.getAll`, causing TS2345 at any
 * call site that mixes them. The global (tsconfig `types` array) is the single
 * source of truth for all Cloudflare workers types across the project.
 */

import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

// ── Constants ──────────────────────────────────────────────────────────────

export const ALLOWED_IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif'
] as const);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Allowlist regex: only alphanumeric, hyphens, underscores, dots, and
 * forward-slashes. Rejects anything that could enable path traversal.
 */
const SAFE_KEY_RE = /^[a-zA-Z0-9_\-./]+$/;

// ── Types ──────────────────────────────────────────────────────────────────

export type MediaScope = 'categories' | 'products' | 'reviews' | 'banners';

// ── Bucket access ──────────────────────────────────────────────────────────

/**
 * Returns the R2 bucket, or null if the binding is absent (e.g. local dev
 * without a wrangler binding configured).
 */
export function getMediaBucketOptional(event: Pick<RequestEvent, 'platform'>): R2Bucket | null {
	return event.platform?.env?.MEDIA ?? null;
}

/**
 * Returns the R2 bucket, or throws an HTTP 500 if the binding is missing.
 * Use this in routes/actions where the bucket is required.
 */
export function getMediaBucket(event: Pick<RequestEvent, 'platform'>): R2Bucket {
	const bucket = getMediaBucketOptional(event);
	if (!bucket) throw error(500, 'R2 bucket binding "MEDIA" is not configured.');
	return bucket;
}

// ── Key helpers ────────────────────────────────────────────────────────────

/**
 * Throws if the key contains path-traversal or characters outside the
 * safe allowlist. Use on every key that originates from user input or
 * a URL parameter.
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
	'image/gif': 'gif'
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
 * high concurrency — avoid `Date.now()` which can collide.
 */
export function buildMediaKey(opts: {
	scope: MediaScope;
	entityId: string;
	variant: string;
	contentType: string;
}): string {
	const SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;

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
	const uid = crypto.randomUUID().replace(/-/g, '');
	return `${opts.scope}/${opts.entityId}/${opts.variant}-${uid}.${ext}`;
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Throws a descriptive Error if the file is not an acceptable image. */
export function validateImageFile(file: File): void {
	if (!ALLOWED_IMAGE_TYPES.has(file.type as any)) {
		throw new Error(`Unsupported image type "${file.type}". Allowed: JPG, PNG, WEBP, AVIF, GIF.`);
	}
	if (file.size <= 0) {
		throw new Error('The file is empty.');
	}
	if (file.size > MAX_IMAGE_BYTES) {
		const mb = (file.size / 1024 / 1024).toFixed(1);
		throw new Error(`Image is too large (${mb} MB). Maximum allowed size is 5 MB.`);
	}
}

// ── Upload / Delete ────────────────────────────────────────────────────────

/**
 * Validates, then uploads an image file to R2.
 * Returns the stored key on success.
 */
export async function uploadImage(opts: {
	bucket: R2Bucket;
	key: string;
	file: File;
}): Promise<string> {
	validateImageFile(opts.file);
	assertSafeR2Key(opts.key);

	const buf = await opts.file.arrayBuffer();

	await opts.bucket.put(opts.key, buf, {
		httpMetadata: {
			contentType: opts.file.type,
			cacheControl: 'public, max-age=31536000, immutable'
		},
		customMetadata: {
			// Sanitize: strip non-printable / special characters, cap length.
			originalName: opts.file.name.replace(/[^\w.\- ]/g, '_').slice(0, 255)
		}
	});

	return opts.key;
}

/**
 * Deletes a key from R2. Safe to call with a null/undefined key, and
 * silently swallows errors (e.g. the object no longer exists).
 */
export async function deleteObjectSafe(opts: {
	bucket: R2Bucket;
	key: string | null | undefined;
}): Promise<void> {
	if (!opts.key) return;
	assertSafeR2Key(opts.key);
	try {
		await opts.bucket.delete(opts.key);
	} catch {
		// Best-effort: non-fatal if the object is already gone.
	}
}
