export const MEDIA_IMAGE_PRESETS = ['thumb', 'card', 'pdp', 'hero'] as const;
export type MediaImagePreset = (typeof MEDIA_IMAGE_PRESETS)[number];

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

export function isMediaImagePreset(value: string): value is MediaImagePreset {
	return (MEDIA_IMAGE_PRESETS as readonly string[]).includes(value);
}

export function mediaPresetUrl(key: string, preset: MediaImagePreset): string {
	if (!key) throw new Error('mediaPresetUrl: key must be a non-empty string.');
	return `/media/_preset/${preset}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
