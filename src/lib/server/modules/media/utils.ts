/**
 * Returns the public URL for a media key served via the /media/[...key] route.
 *
 * Each path segment is individually percent-encoded so that the folder
 * structure is preserved while special characters within segment names
 * are safely escaped.
 */
export function mediaUrl(key: string): string {
	if (!key) throw new Error('mediaUrl: key must be a non-empty string.');
	return `/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}
