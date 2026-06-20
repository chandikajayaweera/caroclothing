import type { ServiceContext } from '$lib/server/foundation/context';
import { makeAdminCtx, makeCustomerCtx, makeServiceEvent } from '../context';

export type StoredFakeR2Object = {
	body: unknown;
	options?: unknown;
};

export type FakeR2Bucket = R2Bucket & {
	objects: Map<string, StoredFakeR2Object>;
	putCalls: string[];
	deleteCalls: string[];
	clear: () => void;
};

export function createFakeR2Bucket(): FakeR2Bucket {
	const objects = new Map<string, StoredFakeR2Object>();
	const putCalls: string[] = [];
	const deleteCalls: string[] = [];

	return {
		objects,
		putCalls,
		deleteCalls,
		async put(key: string, body: unknown, options?: unknown) {
			putCalls.push(key);
			objects.set(key, { body, options });
			return null;
		},
		async delete(key: string) {
			deleteCalls.push(key);
			objects.delete(key);
		},
		clear() {
			objects.clear();
			putCalls.length = 0;
			deleteCalls.length = 0;
		}
	} as unknown as FakeR2Bucket;
}

export function makeImage(name = 'product.png', type = 'image/png'): File {
	return new File([new Uint8Array([137, 80, 78, 71])], name, { type });
}

export function makeMediaEvent(
	bucket: FakeR2Bucket,
	images?: ImagesBinding | null
): NonNullable<ServiceContext['event']> {
	return makeServiceEvent(images ? { MEDIA: bucket, IMAGES: images } : { MEDIA: bucket });
}

export function withMedia(
	ctx: ServiceContext,
	bucket: FakeR2Bucket,
	images?: ImagesBinding | null
): ServiceContext {
	return {
		...ctx,
		event: makeMediaEvent(bucket, images)
	};
}

export function makeMediaAdminCtx(
	bucket = createFakeR2Bucket(),
	overrides: Partial<ServiceContext> = {},
	images?: ImagesBinding | null
): ServiceContext {
	return makeAdminCtx({
		...overrides,
		event: makeMediaEvent(bucket, images)
	});
}

export function makeMediaCustomerCtx(
	bucket = createFakeR2Bucket(),
	userId = 'customer-user',
	overrides: Partial<ServiceContext> = {},
	images?: ImagesBinding | null
): ServiceContext {
	return makeCustomerCtx(userId, {
		...overrides,
		event: makeMediaEvent(bucket, images)
	});
}
