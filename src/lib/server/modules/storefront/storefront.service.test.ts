import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { makeAdminCtx, makeAnonymousCtx } from '../../../../tests/context';
import { seedProduct } from '../../../../tests/factories/products';
import { createFakeR2Bucket, makeImage, makeMediaAdminCtx } from '../../../../tests/fakes/media';
import {
	createStorefrontSection,
	getHomePage,
	listStorefrontSections,
	reorderStorefrontSections,
	setStorefrontSectionEnabled,
	updateStorefrontSection
} from './storefront.service';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) throw new Error('Test database has not been initialized.');
		return dbState.db;
	}
}));

let harness: TestDatabaseHarness;
const now = new Date('2026-07-20T06:00:00.000Z');

describe('storefront service integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
	});

	beforeEach(async () => {
		await harness.reset();
		dbState.db = harness.db;
	});

	afterAll(() => {
		dbState.db = undefined;
		harness.close();
	});

	it('hydrates the bounded seeded homepage from live catalogue sources', async () => {
		const product = await seedProduct(harness.db, {
			name: 'Live New Arrival',
			slug: 'live-new-arrival',
			isActive: true,
			isNewArrival: true
		});

		const page = await getHomePage(makeAnonymousCtx({ now }));

		expect(page.generatedAt).toEqual(now);
		expect(page.sections.map((section) => section.type)).toEqual([
			'hero',
			'product_grid',
			'category_showcase',
			'review_rail',
			'service_strip'
		]);
		expect(page.sections.find((section) => section.type === 'product_grid')?.products).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: product.id, name: product.name })])
		);
	});

	it('creates sections disabled, enforces source contracts, and applies schedules', async () => {
		const ctx = makeAdminCtx({ now });
		const startsAt = now.getTime() + 60_000;
		const created = await createStorefrontSection(ctx, {
			type: 'hero',
			adminName: 'Scheduled campaign hero',
			layoutVariant: 'split',
			sourceType: 'manual',
			title: 'Next campaign',
			itemLimit: 1,
			startsAt
		});

		expect(created).toMatchObject({ enabled: false, visibilityStatus: 'disabled', sortOrder: 5 });
		const enabled = await setStorefrontSectionEnabled(ctx, {
			sectionId: created.id,
			enabled: true
		});
		expect(enabled.visibilityStatus).toBe('scheduled');
		expect(
			(await getHomePage(makeAnonymousCtx({ now }))).sections.map((section) => section.id)
		).not.toContain(created.id);

		await expect(
			createStorefrontSection(ctx, {
				type: 'product_grid',
				adminName: 'Invalid manual grid',
				layoutVariant: 'grid_4',
				sourceType: 'manual'
			})
		).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
	});

	it('requires the exact page inventory when reordering and denies public admin reads', async () => {
		const ctx = makeAdminCtx({ now });
		const original = await listStorefrontSections(ctx);
		const reversedIds = original.map((section) => section.id).reverse();
		const reordered = await reorderStorefrontSections(ctx, { sectionIds: reversedIds });

		expect(reordered.map((section) => section.id)).toEqual(reversedIds);
		expect(reordered.map((section) => section.sortOrder)).toEqual([0, 1, 2, 3, 4]);
		await expect(
			reorderStorefrontSections(ctx, { sectionIds: reversedIds.slice(1) })
		).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
		await expect(listStorefrontSections(makeAnonymousCtx({ now }))).rejects.toMatchObject({
			code: ErrorCode.AUTHENTICATION_REQUIRED
		});
	});

	it('classifies unsupported storefront images as client validation errors', async () => {
		const bucket = createFakeR2Bucket();
		const desktopImage = new File([new Uint8Array([1, 2, 3])], 'hero.heic', {
			type: 'image/heic'
		});

		await expect(
			createStorefrontSection(makeMediaAdminCtx(bucket, { now }), {
				type: 'hero',
				adminName: 'Unsupported image hero',
				layoutVariant: 'full_bleed',
				sourceType: 'manual',
				desktopImage
			})
		).rejects.toMatchObject({
			code: ErrorCode.INVALID_MEDIA_TYPE,
			statusCode: 400,
			message: 'Unsupported content type "image/heic".'
		});
		expect(bucket.putCalls).toHaveLength(0);
	});

	it('reconciles an uploaded image when every D1 response is an ambiguous reset', async () => {
		const bucket = createFakeR2Bucket();
		const originalDb = harness.db;
		let batchCalls = 0;
		dbState.db = new Proxy(originalDb, {
			get(target, property, receiver) {
				if (property === 'batch') {
					return async (statements: Parameters<typeof target.batch>[0]) => {
						batchCalls += 1;
						await target.batch(statements);
						throw storageResetError();
					};
				}
				const value = Reflect.get(target, property, receiver);
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});

		try {
			const hero = (await listStorefrontSections(makeAdminCtx({ now }))).find(
				(section) => section.id === 'home-hero'
			)!;
			const updated = await updateStorefrontSection(makeMediaAdminCtx(bucket, { now }), {
				sectionId: hero.id,
				data: {
					title: 'Recovered hero',
					desktopImage: makeImage('hero-desktop.png')
				}
			});
			const desktop = updated.media.find((item) => item.role === 'desktop');

			expect(batchCalls).toBe(1);
			expect(updated.title).toBe('Recovered hero');
			expect(desktop).toBeDefined();
			expect(bucket.objects.has(desktop!.r2Key)).toBe(true);
			expect(bucket.deleteCalls).not.toContain(desktop!.r2Key);
		} finally {
			dbState.db = originalDb;
		}
	});

	it('removes an upload when D1 resets before the batch can commit', async () => {
		const bucket = createFakeR2Bucket();
		const originalDb = harness.db;
		let batchCalls = 0;
		dbState.db = new Proxy(originalDb, {
			get(target, property, receiver) {
				if (property === 'batch') {
					return async () => {
						batchCalls += 1;
						throw storageResetError();
					};
				}
				const value = Reflect.get(target, property, receiver);
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});

		try {
			await expect(
				updateStorefrontSection(makeMediaAdminCtx(bucket, { now }), {
					sectionId: 'home-hero',
					data: { desktopImage: makeImage('hero-desktop.png') }
				})
			).rejects.toMatchObject({
				code: ErrorCode.DATABASE_UNAVAILABLE,
				statusCode: 503,
				message: 'The database is temporarily unavailable. Please try again.'
			});

			expect(batchCalls).toBe(3);
			expect(bucket.putCalls).toHaveLength(1);
			expect(bucket.deleteCalls).toEqual(bucket.putCalls);
			expect(bucket.objects.size).toBe(0);
		} finally {
			dbState.db = originalDb;
		}
	});
});

function storageResetError() {
	const error = new Error('Failed query: D1 batch');
	error.cause = new Error(
		'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
	);
	return error;
}
