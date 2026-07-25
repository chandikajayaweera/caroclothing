import { expect } from 'vitest';
import type { FakeR2Bucket } from '../fakes/media';

export function expectR2ObjectKeys(bucket: FakeR2Bucket, expectedKeys: string[]) {
	expect([...bucket.objects.keys()].sort()).toEqual([...expectedKeys].sort());
}

export function expectR2Deleted(bucket: FakeR2Bucket, expectedKeys: string[]) {
	expect(bucket.deleteCalls).toEqual(expect.arrayContaining(expectedKeys));

	for (const key of expectedKeys) {
		expect(bucket.objects.has(key)).toBe(false);
	}
}

export function expectR2Clean(bucket: FakeR2Bucket) {
	expect(bucket.objects.size).toBe(0);
}
