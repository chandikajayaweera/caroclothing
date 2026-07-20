export const MEDIA_IMAGE_PRESETS = {
	thumb160: {
		width: 160,
		fit: 'scale-down',
		quality: 78
	},
	card400: {
		width: 400,
		height: 533,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	},
	card600: {
		width: 600,
		height: 800,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	},
	card800: {
		width: 800,
		height: 1067,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	},
	square400: {
		width: 400,
		height: 400,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	},
	square600: {
		width: 600,
		height: 600,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	},
	product800: {
		width: 800,
		fit: 'scale-down',
		quality: 85
	},
	product1200: {
		width: 1200,
		fit: 'scale-down',
		quality: 85
	},
	hero960: {
		width: 960,
		height: 420,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	},
	hero1600: {
		width: 1600,
		height: 700,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	},
	heroMobile720: {
		width: 720,
		height: 960,
		fit: 'crop',
		gravity: 'auto',
		quality: 80
	}
} as const;

export const MEDIA_IMAGE_PRESET_NAMES = Object.keys(MEDIA_IMAGE_PRESETS) as MediaImagePreset[];

export type MediaImagePreset = keyof typeof MEDIA_IMAGE_PRESETS;

export type MediaImageAttrs = {
	src: string;
	srcset: string;
	sizes: string;
	width?: number;
	height?: number;
	loading?: 'eager' | 'lazy';
	decoding?: 'async' | 'auto' | 'sync';
	fetchpriority?: 'high' | 'low' | 'auto';
};

type MediaImageLike = {
	r2Key?: string | null;
	altText?: string | null;
	imageUrl?: string | null;
};

function encodedKeyPath(key: string): string {
	return key.split('/').map(encodeURIComponent).join('/');
}

export function mediaOriginalUrl(key: string): string {
	if (!key) throw new Error('mediaOriginalUrl: key must be a non-empty string.');
	return `/media/${encodedKeyPath(key)}`;
}

export const mediaUrl = mediaOriginalUrl;

export function isMediaImagePreset(value: string): value is MediaImagePreset {
	return Object.prototype.hasOwnProperty.call(MEDIA_IMAGE_PRESETS, value);
}

export function mediaPresetUrl(key: string, preset: MediaImagePreset): string {
	if (!key) throw new Error('mediaPresetUrl: key must be a non-empty string.');
	return `/media/_preset/${preset}/${encodedKeyPath(key)}`;
}

export function mediaSrcset(key: string, presets: readonly MediaImagePreset[]): string {
	return presets
		.map((preset) => `${mediaPresetUrl(key, preset)} ${MEDIA_IMAGE_PRESETS[preset].width}w`)
		.join(', ');
}

export function productCardImageAttrs(image: MediaImageLike): MediaImageAttrs | null {
	if (!image.r2Key) return image.imageUrl ? fallbackAttrs(image.imageUrl) : null;

	return {
		src: mediaPresetUrl(image.r2Key, 'card600'),
		srcset: mediaSrcset(image.r2Key, ['card400', 'card600', 'card800']),
		sizes: '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw',
		width: 600,
		height: 800,
		loading: 'lazy',
		decoding: 'async'
	};
}

export function productDetailImageAttrs(
	image: MediaImageLike,
	options: { priority?: boolean } = {}
): MediaImageAttrs | null {
	if (!image.r2Key) return image.imageUrl ? fallbackAttrs(image.imageUrl) : null;

	return {
		src: mediaPresetUrl(image.r2Key, 'product800'),
		srcset: mediaSrcset(image.r2Key, ['product800', 'product1200']),
		sizes: '(max-width: 768px) 100vw, (max-width: 1200px) 58vw, 760px',
		width: 800,
		loading: options.priority ? 'eager' : 'lazy',
		decoding: 'async',
		fetchpriority: options.priority ? 'high' : undefined
	};
}

export function productThumbnailImageAttrs(image: MediaImageLike): MediaImageAttrs | null {
	if (!image.r2Key) return image.imageUrl ? fallbackAttrs(image.imageUrl) : null;

	return {
		src: mediaPresetUrl(image.r2Key, 'thumb160'),
		srcset: '',
		sizes: '80px',
		width: 160,
		loading: 'lazy',
		decoding: 'async'
	};
}

export function heroImageAttrs(
	image: MediaImageLike,
	options: { priority?: boolean } = {}
): MediaImageAttrs | null {
	if (!image.r2Key) return image.imageUrl ? fallbackAttrs(image.imageUrl) : null;

	return {
		src: mediaPresetUrl(image.r2Key, 'hero960'),
		srcset: mediaSrcset(image.r2Key, ['hero960', 'hero1600']),
		sizes: '100vw',
		width: 1600,
		height: 700,
		loading: options.priority ? 'eager' : 'lazy',
		decoding: 'async',
		fetchpriority: options.priority ? 'high' : undefined
	};
}

export function heroMobileImageAttrs(
	image: MediaImageLike,
	options: { priority?: boolean } = {}
): MediaImageAttrs | null {
	if (!image.r2Key) return image.imageUrl ? fallbackAttrs(image.imageUrl) : null;

	return {
		src: mediaPresetUrl(image.r2Key, 'heroMobile720'),
		srcset: '',
		sizes: '100vw',
		width: 720,
		height: 960,
		loading: options.priority ? 'eager' : 'lazy',
		decoding: 'async',
		fetchpriority: options.priority ? 'high' : undefined
	};
}

function fallbackAttrs(src: string): MediaImageAttrs {
	return {
		src,
		srcset: '',
		sizes: '100vw',
		loading: 'lazy',
		decoding: 'async'
	};
}
