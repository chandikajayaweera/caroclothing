import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertSafeR2Key, getMediaBucket } from '$lib/server/infrastructure/media/r2';
import {
	isMediaImagePreset,
	mediaUrl,
	type MediaImagePreset
} from '$lib/server/infrastructure/media';
/*
 * R2Object is not imported here. Wrangler-generated runtime types are loaded
 * globally from src/worker-configuration.d.ts, avoiding duplicate Cloudflare
 * runtime type identities.
 */

/**
 * Builds shared response headers from an R2Object.
 *
 * Copies stored R2 HTTP metadata manually so local Miniflare does not need to
 * serialize a Headers instance across its internal RPC boundary.
 *
 * Cloudflare recommends `obj.httpEtag` (RFC 9110 quoted) over `obj.etag` (raw hex).
 */
function buildHeaders(obj: R2Object): Headers {
	const headers = new Headers();

	applyR2HttpMetadata(headers, obj.httpMetadata);

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

function applyR2HttpMetadata(headers: Headers, metadata: R2HTTPMetadata | undefined): void {
	if (!metadata) return;

	setHeader(headers, 'Content-Type', metadata.contentType);
	setHeader(headers, 'Content-Language', metadata.contentLanguage);
	setHeader(headers, 'Content-Disposition', metadata.contentDisposition);
	setHeader(headers, 'Content-Encoding', metadata.contentEncoding);
	setHeader(headers, 'Cache-Control', metadata.cacheControl);

	if (metadata.cacheExpiry) {
		headers.set('Expires', metadata.cacheExpiry.toUTCString());
	}
}

function setHeader(headers: Headers, name: string, value: string | undefined): void {
	if (value) {
		headers.set(name, value);
	}
}

function parseMediaParam(param: string): { key: string; preset: MediaImagePreset | null } {
	const segments = param.split('/');

	if (segments[0] !== '_preset') {
		return { key: param, preset: null };
	}

	const preset = segments[1];
	const key = segments.slice(2).join('/');

	if (!preset || !isMediaImagePreset(preset) || !key) {
		throw error(400, 'Invalid media preset.');
	}

	return { key, preset };
}

function isImageObject(obj: R2Object): boolean {
	return Boolean(obj.httpMetadata?.contentType?.startsWith('image/'));
}

function isTransformableImageObject(obj: R2Object): boolean {
	return isImageObject(obj) && obj.httpMetadata?.contentType !== 'image/gif';
}

function presetToImageOptions(
	preset: MediaImagePreset,
	acceptHeader: string | null
): RequestInitCfPropertiesImage {
	const base = (() => {
		if (preset === 'thumb') return { width: 240, fit: 'scale-down', quality: 78 } as const;
		if (preset === 'card') return { width: 640, fit: 'scale-down', quality: 80 } as const;
		if (preset === 'pdp') return { width: 1200, fit: 'scale-down', quality: 84 } as const;
		return { width: 2400, fit: 'scale-down', quality: 84 } as const;
	})();
	const format = preferredImageFormat(acceptHeader);

	return format ? { ...base, format } : base;
}

function preferredImageFormat(
	acceptHeader: string | null
): RequestInitCfPropertiesImage['format'] | undefined {
	if (!acceptHeader) return 'webp';
	if (acceptHeader.includes('image/avif')) return 'avif';
	if (acceptHeader.includes('image/webp')) return 'webp';
	return undefined;
}

function withMediaHeaders(response: Response): Response {
	const headers = new Headers(response.headers);

	if (!headers.has('Cache-Control')) {
		headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	}
	headers.set('X-Content-Type-Options', 'nosniff');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

async function getOriginalObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody> {
	const obj = await bucket.get(key);
	if (!obj) throw error(404, 'Not found.');
	return obj;
}

async function serveOriginalObject(
	bucket: R2Bucket,
	key: string,
	request: Request
): Promise<Response> {
	const obj = await getOriginalObject(bucket, key);
	const headers = buildHeaders(obj);
	const ifNoneMatch = request.headers.get('If-None-Match');

	if (ifNoneMatch && (ifNoneMatch === obj.httpEtag || ifNoneMatch === '*')) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(obj.body, { status: 200, headers });
}

async function servePresetObject(
	event: Parameters<RequestHandler>[0],
	key: string,
	preset: MediaImagePreset,
	sourceHead: R2Object
): Promise<Response> {
	if (!isTransformableImageObject(sourceHead)) {
		const bucket = getMediaBucket(event);
		return serveOriginalObject(bucket, key, event.request);
	}

	const sourceUrl = new URL(mediaUrl(key), event.url.origin);
	const response = await fetch(new Request(sourceUrl, { headers: event.request.headers }), {
		cf: {
			image: presetToImageOptions(preset, event.request.headers.get('Accept'))
		}
	});

	if (response.ok || response.status === 304) {
		return withMediaHeaders(response);
	}

	console.warn(`[Media] preset transform failed for "${key}" (${preset}): ${response.status}`);
	const bucket = getMediaBucket(event);
	return serveOriginalObject(bucket, key, event.request);
}

/**
 * HEAD - metadata only, no body.
 * Uses `bucket.head()` which is cheaper than `bucket.get()` as R2 does not
 * transfer the object body.
 */
export const HEAD: RequestHandler = async (event) => {
	const parsed = parseMediaParam(event.params.key);

	try {
		assertSafeR2Key(parsed.key);
	} catch {
		throw error(400, 'Invalid media key.');
	}

	const bucket = getMediaBucket(event);
	const obj = await bucket.head(parsed.key);
	if (!obj) throw error(404, 'Not found.');

	if (parsed.preset) {
		const response = await servePresetObject(event, parsed.key, parsed.preset, obj);
		await response.body?.cancel().catch(() => undefined);

		return new Response(null, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}

	return new Response(null, { status: 200, headers: buildHeaders(obj) });
};

/**
 * GET - streams the object body.
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
	const parsed = parseMediaParam(event.params.key);

	try {
		assertSafeR2Key(parsed.key);
	} catch {
		throw error(400, 'Invalid media key.');
	}

	const bucket = getMediaBucket(event);
	const head = await bucket.head(parsed.key);
	if (!head) throw error(404, 'Not found.');

	if (parsed.preset) {
		return servePresetObject(event, parsed.key, parsed.preset, head);
	}

	return serveOriginalObject(bucket, parsed.key, event.request);
};
