import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSafeR2Key, getMediaBucket } from '$lib/server/modules/media/r2';
/*
 * ⚠️  Do NOT `import type { R2Object } from '@cloudflare/workers-types'` here.
 * An explicit import creates a module-scoped type identity that conflicts with
 * the global R2Object merged in by tsconfig.json's `types` array. The mismatch
 * surfaces as TS2345 on `writeHttpMetadata(headers)` and `new Response(obj.body)`
 * because the imported and global versions of Headers/ReadableStream are treated
 * as distinct types. Always use the global — it's already in scope.
 */

/**
 * Builds shared response headers from an R2Object.
 *
 * Uses the official `obj.writeHttpMetadata(headers)` API — the idiomatic
 * Cloudflare method that applies content-type, cache-control, content-encoding,
 * content-disposition, and content-language to the Headers object in one call.
 *
 * Cloudflare recommends `obj.httpEtag` (RFC 9110 quoted) over `obj.etag` (raw hex).
 */
function buildHeaders(obj: R2Object): Headers {
	const headers = new Headers();

	// Idiomatic R2: writes all stored HTTP metadata fields at once.
	obj.writeHttpMetadata(headers);

	// Fallbacks in case metadata wasn't stored on upload (defensive).
	if (!headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/octet-stream');
	}
	if (!headers.has('Cache-Control')) {
		headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	}

	// httpEtag is always present on R2 objects and is already quoted per RFC 9110.
	headers.set('ETag', obj.httpEtag);
	headers.set('Content-Length', String(obj.size));
	// Prevent MIME-sniffing of user-uploaded content.
	headers.set('X-Content-Type-Options', 'nosniff');

	return headers;
}

/**
 * HEAD — metadata only, no body.
 * Uses `bucket.head()` which is cheaper than `bucket.get()` as R2 does not
 * transfer the object body.
 */
export const HEAD: RequestHandler = async (event) => {
	const { key } = event.params;

	try {
		assertSafeR2Key(key);
	} catch {
		throw error(400, 'Invalid media key.');
	}

	const bucket = getMediaBucket(event);
	const obj = await bucket.head(key);
	if (!obj) throw error(404, 'Not found.');

	return new Response(null, { status: 200, headers: buildHeaders(obj) });
};

/**
 * GET — streams the object body.
 *
 * Supports conditional requests via `If-None-Match`: when the client
 * already holds a cached copy with a matching ETag, a lightweight 304 is
 * returned with no body, saving bandwidth.
 *
 * Note: we compare ETags manually in the Worker rather than passing
 * `onlyIf: request.headers` to `bucket.get()`, because R2's onlyIf has
 * a known bug where `W/`-prefixed ETags from browsers can throw a TypeError.
 * The manual approach is more reliable and the performance difference is
 * negligible (R2-to-Worker egress is free).
 */
export const GET: RequestHandler = async (event) => {
	const { key } = event.params;

	try {
		assertSafeR2Key(key);
	} catch {
		throw error(400, 'Invalid media key.');
	}

	const bucket = getMediaBucket(event);
	const obj = await bucket.get(key);
	if (!obj) throw error(404, 'Not found.');

	const headers = buildHeaders(obj);

	// Conditional GET — honour If-None-Match for cache revalidation (RFC 7232).
	// For GET/HEAD, a matching ETag must return 304, not 412.
	const ifNoneMatch = event.request.headers.get('If-None-Match');
	if (ifNoneMatch && (ifNoneMatch === obj.httpEtag || ifNoneMatch === '*')) {
		// 304 must still carry caching headers so the client can refresh its TTL.
		return new Response(null, { status: 304, headers });
	}

	return new Response(obj.body, { status: 200, headers });
};
