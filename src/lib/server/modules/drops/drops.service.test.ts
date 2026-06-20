import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceContext } from '$lib/server/foundation/context';
import { ErrorCode } from '$lib/server/infrastructure/errors';
import { notificationOutbox } from '../notifications/outbox/outbox.drizzle';
import { drop, dropProduct, dropWaitlist } from './drops.drizzle';
import {
	createDrop,
	deleteDrop,
	getDrop,
	joinDropWaitlist,
	linkDropWaitlistEntriesFromUserToUser,
	linkDropWaitlistEntriesToUser,
	listDrops,
	listDropWaitlistEntries,
	listUnnotifiedDropWaitlistEntries,
	markDropWaitlistEntriesNotified,
	markDropWaitlistEntryNotified,
	setDropHeroProduct,
	setDropProducts,
	transitionDropStatus,
	transitionDueDropsToLive,
	updateDrop
} from './drops.service';
import { createTestDatabase, type TestDatabaseHarness } from '../../../../tests/db';
import { seedUser } from '../../../../tests/factories/auth';
import { makeAdminCtx, makeCustomerCtx } from '../../../../tests/context';
import { dropInput, seedDrop, seedDropWaitlistEntry } from '../../../../tests/factories/drops';
import { createFakeNotificationQueue } from '../../../../tests/fakes/queue';
import { createFakeR2Bucket, makeImage, makeMediaAdminCtx } from '../../../../tests/fakes/media';
import { seedProduct } from '../../../../tests/factories/products';

const dbState = vi.hoisted((): { db: unknown } => ({ db: undefined }));

vi.mock('$lib/server/db', () => ({
	getDb: () => {
		if (!dbState.db) {
			throw new Error('Test database has not been initialized.');
		}

		return dbState.db;
	}
}));

vi.mock('$lib/server/infrastructure/env', () => ({
	getEnv: () => ({
		PUBLIC_APP_URL: 'https://staging.caroclothing.test'
	})
}));

let harness: TestDatabaseHarness;
const now = new Date('2026-06-19T10:00:00.000Z');

function db() {
	return harness.db;
}

function adminCtx(overrides: Partial<ServiceContext> = {}): ServiceContext {
	return makeAdminCtx({ now, ...overrides });
}

function mediaAdminCtx(bucket = createFakeR2Bucket(), overrides: Partial<ServiceContext> = {}) {
	return makeMediaAdminCtx(bucket, {
		now,
		...overrides
	});
}

async function seedDropProduct(overrides: Parameters<typeof seedProduct>[1] = {}) {
	return seedProduct(db(), {
		tier: 'drop',
		isActive: true,
		slug: `drop-product-${crypto.randomUUID().slice(0, 8)}`,
		...overrides
	});
}

async function dropRows() {
	return db().select().from(drop);
}

async function assignmentRows(dropId: string) {
	return db().select().from(dropProduct).where(eq(dropProduct.dropId, dropId));
}

async function waitlistRows(dropId: string) {
	return db().select().from(dropWaitlist).where(eq(dropWaitlist.dropId, dropId));
}

describe('drops service integration', () => {
	beforeAll(async () => {
		harness = await createTestDatabase();
		dbState.db = harness.db;
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(() => {
		dbState.db = undefined;
		harness.close();
	});

	describe('drop lifecycle and media', () => {
		it('creates teaser drops with uploaded hero media and public media URLs', async () => {
			const bucket = createFakeR2Bucket();

			const created = await createDrop(
				mediaAdminCtx(bucket),
				dropInput({
					slug: 'drop-alpha',
					name: 'DROP ALPHA',
					heroImage: makeImage('drop-alpha.png'),
					launchAt: now.getTime() + 60 * 60 * 1000
				})
			);

			expect(created).toMatchObject({
				slug: 'drop-alpha',
				name: 'DROP ALPHA',
				status: 'teaser',
				sortOrder: 0,
				products: []
			});
			expect(created.heroImageR2Key).toMatch(/^banners\/.+\/hero-.+\.png$/);
			expect(created.heroImageUrl).toBe(`/media/${created.heroImageR2Key}`);
			expect(bucket.putCalls).toEqual([created.heroImageR2Key]);
			expect(bucket.objects.has(created.heroImageR2Key!)).toBe(true);
		});

		it('cleans uploaded hero media when create persistence fails', async () => {
			await createDrop(adminCtx(), dropInput({ slug: 'duplicate-drop' }));
			const bucket = createFakeR2Bucket();

			await expect(
				createDrop(
					mediaAdminCtx(bucket),
					dropInput({
						slug: 'duplicate-drop',
						heroImage: makeImage('duplicate.png')
					})
				)
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			expect(bucket.putCalls).toHaveLength(1);
			expect(bucket.deleteCalls).toEqual(bucket.putCalls);
			expect(bucket.objects.size).toBe(0);
			expect(await dropRows()).toHaveLength(1);
		});

		it('replaces and removes hero media after the DB update succeeds', async () => {
			const bucket = createFakeR2Bucket();
			const created = await createDrop(
				mediaAdminCtx(bucket),
				dropInput({ slug: 'media-drop', heroImage: makeImage('initial.png') })
			);
			const initialKey = created.heroImageR2Key!;
			bucket.putCalls.length = 0;
			bucket.deleteCalls.length = 0;

			const replaced = await updateDrop(
				mediaAdminCtx(bucket),
				{ id: created.id },
				{
					heroImage: makeImage('replacement.png')
				}
			);
			expect(replaced.heroImageR2Key).not.toBe(initialKey);
			expect(bucket.putCalls).toEqual([replaced.heroImageR2Key]);
			expect(bucket.deleteCalls).toEqual([initialKey]);
			expect(bucket.objects.has(initialKey)).toBe(false);
			expect(bucket.objects.has(replaced.heroImageR2Key!)).toBe(true);

			const removed = await updateDrop(
				mediaAdminCtx(bucket),
				{ id: created.id },
				{
					removeHeroImage: true
				}
			);
			expect(removed.heroImageR2Key).toBeNull();
			expect(bucket.deleteCalls).toContain(replaced.heroImageR2Key!);
			expect(bucket.objects.has(replaced.heroImageR2Key!)).toBe(false);
		});

		it('cleans replacement hero media when update persistence fails', async () => {
			await createDrop(adminCtx(), dropInput({ slug: 'taken-drop' }));
			const target = await createDrop(adminCtx(), dropInput({ slug: 'target-drop' }));
			const bucket = createFakeR2Bucket();

			await expect(
				updateDrop(
					mediaAdminCtx(bucket),
					{ id: target.id },
					{
						slug: 'taken-drop',
						heroImage: makeImage('orphan.png')
					}
				)
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			expect(bucket.putCalls).toHaveLength(1);
			expect(bucket.deleteCalls).toEqual(bucket.putCalls);
			const [unchanged] = await db().select().from(drop).where(eq(drop.id, target.id));
			expect(unchanged.slug).toBe('target-drop');
			expect(unchanged.heroImageR2Key).toBeNull();
		});

		it('deletes drops, cascades owned rows, and cleans hero media', async () => {
			const bucket = createFakeR2Bucket();
			const created = await createDrop(
				mediaAdminCtx(bucket),
				dropInput({ slug: 'delete-drop', heroImage: makeImage('delete.png') })
			);
			const product = await seedDropProduct();
			await setDropProducts(adminCtx(), { dropId: created.id, productIds: [product.id] });
			await joinDropWaitlist(null, {
				dropId: created.id,
				contact: 'delete@example.test',
				contactType: 'email'
			});
			bucket.deleteCalls.length = 0;

			await deleteDrop(mediaAdminCtx(bucket), { id: created.id });

			expect(await db().select().from(drop).where(eq(drop.id, created.id))).toHaveLength(0);
			expect(await assignmentRows(created.id)).toHaveLength(0);
			expect(await waitlistRows(created.id)).toHaveLength(0);
			expect(bucket.deleteCalls).toEqual([created.heroImageR2Key]);
		});

		it('hides archived drops from public reads and requires admin for archived reads', async () => {
			await seedDrop(db(), { slug: 'live-drop', status: 'live', sortOrder: 0 });
			const archived = await seedDrop(db(), {
				slug: 'archived-drop',
				status: 'archived',
				sortOrder: 1
			});

			const publicList = await listDrops(null);
			expect(publicList.items.map((item) => item.slug)).toEqual(['live-drop']);

			await expect(getDrop(null, { id: archived.id })).rejects.toMatchObject({
				code: ErrorCode.DROP_NOT_FOUND
			});

			await expect(
				listDrops(makeCustomerCtx('customer-user'), { includeArchived: true })
			).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });

			const adminList = await listDrops(adminCtx(), { includeArchived: true });
			expect(adminList.items.map((item) => item.slug).sort()).toEqual([
				'archived-drop',
				'live-drop'
			]);
		});

		it('requires admin access for drop writes', async () => {
			await expect(
				createDrop(makeCustomerCtx('customer-user'), dropInput({ slug: 'denied-drop' }))
			).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
		});
	});

	describe('drop product assignments', () => {
		it('sets lineups, hydrates products, and preserves the hero product across reorder', async () => {
			const dropRow = await seedDrop(db(), { slug: 'lineup-drop', status: 'teaser' });
			const first = await seedDropProduct({ name: 'First Drop Tee', slug: 'first-drop-tee' });
			const second = await seedDropProduct({ name: 'Second Drop Tee', slug: 'second-drop-tee' });

			await setDropProducts(adminCtx(), { dropId: dropRow.id, productIds: [first.id, second.id] });
			await setDropHeroProduct(adminCtx(), { dropId: dropRow.id, productId: second.id });
			const reordered = await setDropProducts(adminCtx(), {
				dropId: dropRow.id,
				productIds: [second.id, first.id]
			});

			expect(reordered.products.map((item) => item.productId)).toEqual([second.id, first.id]);
			expect(reordered.products.map((item) => item.sortOrder)).toEqual([0, 1]);
			expect(reordered.products.find((item) => item.productId === second.id)?.isHero).toBe(true);
			expect(reordered.products[0].product?.slug).toBe('second-drop-tee');
		});

		it('rejects duplicate, missing, inactive, and non-drop products without changing assignments', async () => {
			const dropRow = await seedDrop(db(), { slug: 'validation-drop' });
			const assigned = await seedDropProduct({ slug: 'assigned-drop-product' });
			const inactive = await seedDropProduct({ slug: 'inactive-drop-product', isActive: false });
			const core = await seedProduct(db(), {
				slug: 'core-product',
				tier: 'core',
				isActive: true
			});
			await setDropProducts(adminCtx(), { dropId: dropRow.id, productIds: [assigned.id] });

			await expect(
				setDropProducts(adminCtx(), { dropId: dropRow.id, productIds: [assigned.id, assigned.id] })
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			await expect(
				setDropProducts(adminCtx(), { dropId: dropRow.id, productIds: ['missing-product'] })
			).rejects.toMatchObject({ code: ErrorCode.PRODUCT_NOT_FOUND });

			await expect(
				setDropProducts(adminCtx(), { dropId: dropRow.id, productIds: [inactive.id] })
			).rejects.toMatchObject({ code: ErrorCode.PRODUCT_UNAVAILABLE });

			await expect(
				setDropProducts(adminCtx(), { dropId: dropRow.id, productIds: [core.id] })
			).rejects.toMatchObject({ code: ErrorCode.PRODUCT_UNAVAILABLE });

			const rows = await assignmentRows(dropRow.id);
			expect(rows).toHaveLength(1);
			expect(rows[0].productId).toBe(assigned.id);
		});

		it('prevents products from being assigned to another non-archived drop', async () => {
			const firstDrop = await seedDrop(db(), { slug: 'first-assignment-drop' });
			const secondDrop = await seedDrop(db(), { slug: 'second-assignment-drop' });
			const product = await seedDropProduct({ slug: 'exclusive-drop-product' });
			await setDropProducts(adminCtx(), { dropId: firstDrop.id, productIds: [product.id] });

			await expect(
				setDropProducts(adminCtx(), { dropId: secondDrop.id, productIds: [product.id] })
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
		});

		it('allows products assigned only to archived drops to be reused', async () => {
			const archivedDrop = await seedDrop(db(), {
				slug: 'archived-assignment-drop',
				status: 'archived'
			});
			const targetDrop = await seedDrop(db(), { slug: 'fresh-assignment-drop' });
			const product = await seedDropProduct({ slug: 'reusable-drop-product' });
			await db().insert(dropProduct).values({
				dropId: archivedDrop.id,
				productId: product.id,
				isHero: false,
				sortOrder: 0
			});

			const updated = await setDropProducts(adminCtx(), {
				dropId: targetDrop.id,
				productIds: [product.id]
			});

			expect(updated.products.map((item) => item.productId)).toEqual([product.id]);
		});

		it('rejects missing hero assignments and archived drop lineup changes', async () => {
			const teaserDrop = await seedDrop(db(), { slug: 'hero-validation-drop' });
			const archivedDrop = await seedDrop(db(), {
				slug: 'archived-lineup-drop',
				status: 'archived'
			});
			const product = await seedDropProduct({ slug: 'hero-product' });

			await expect(
				setDropHeroProduct(adminCtx(), { dropId: teaserDrop.id, productId: product.id })
			).rejects.toMatchObject({ code: ErrorCode.DROP_PRODUCT_NOT_FOUND });

			await expect(
				setDropProducts(adminCtx(), { dropId: archivedDrop.id, productIds: [product.id] })
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
		});
	});

	describe('status transitions and launch jobs', () => {
		it('rejects invalid status transitions and not-ready launch windows', async () => {
			const liveDrop = await seedDrop(db(), { slug: 'live-status-drop', status: 'live' });
			const missingLaunch = await seedDrop(db(), { slug: 'missing-launch-drop' });
			const futureLaunch = await seedDrop(db(), {
				slug: 'future-launch-drop',
				launchAt: new Date(now.getTime() + 60 * 60 * 1000)
			});
			const noProducts = await seedDrop(db(), {
				slug: 'empty-launch-drop',
				launchAt: now
			});

			await expect(
				transitionDropStatus(adminCtx(), { dropId: liveDrop.id, toStatus: 'teaser', now })
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			await expect(
				transitionDropStatus(adminCtx(), { dropId: missingLaunch.id, toStatus: 'live', now })
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

			await expect(
				transitionDropStatus(adminCtx(), { dropId: futureLaunch.id, toStatus: 'live', now })
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			await expect(
				transitionDropStatus(adminCtx(), { dropId: noProducts.id, toStatus: 'live', now })
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
		});

		it('launches a ready drop, enqueues waitlist notifications, and publishes queue wakeups', async () => {
			const user = await seedUser(db(), { id: 'launch-user' });
			const dropRow = await seedDrop(db(), {
				slug: 'ready-launch-drop',
				name: 'READY DROP',
				tagline: 'Launch tagline',
				launchAt: now
			});
			const product = await seedDropProduct({ slug: 'ready-launch-product' });
			await setDropProducts(adminCtx(), { dropId: dropRow.id, productIds: [product.id] });
			const emailEntry = await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: 'fan@example.test',
				contactType: 'email',
				userId: user.id
			});
			const smsEntry = await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: '+94771234567',
				contactType: 'phone',
				userId: null
			});
			const queue = createFakeNotificationQueue();

			const launched = await transitionDropStatus(
				adminCtx({
					notificationQueue: queue
				}),
				{ dropId: dropRow.id, toStatus: 'live', now }
			);

			expect(launched.status).toBe('live');
			const notifications = await db()
				.select()
				.from(notificationOutbox)
				.where(eq(notificationOutbox.aggregateId, dropRow.id));
			expect(notifications).toHaveLength(2);
			expect(notifications.map((row) => row.channel).sort()).toEqual(['email', 'sms']);
			expect(notifications.map((row) => row.type)).toEqual(['drop_launch', 'drop_launch']);
			expect(notifications.map((row) => row.status)).toEqual(['pending', 'pending']);
			expect(notifications.map((row) => row.idempotencyKey).sort()).toEqual(
				[
					`drop:${dropRow.id}:launch:${emailEntry.id}:email`,
					`drop:${dropRow.id}:launch:${smsEntry.id}:sms`
				].sort()
			);
			expect(notifications.find((row) => row.channel === 'email')?.payloadJson).toMatchObject({
				to: 'fan@example.test',
				dropName: 'READY DROP',
				dropSlug: 'ready-launch-drop',
				dropUrl: 'https://staging.caroclothing.test/drops/ready-launch-drop',
				tagline: 'Launch tagline'
			});
			expect(notifications.find((row) => row.channel === 'sms')?.payloadJson).toMatchObject({
				to: '+94771234567',
				dropName: 'READY DROP',
				dropUrl: 'https://staging.caroclothing.test/drops/ready-launch-drop'
			});
			expect(queue.batches).toHaveLength(1);
			expect(queue.batches[0]).toHaveLength(2);
			expect(queue.batches[0].map((message) => message.body.idempotencyKey).sort()).toEqual(
				notifications.map((row) => row.idempotencyKey).sort()
			);
		});

		it('transitions due drops one-by-one and reports skipped invalid drops', async () => {
			const readyDrop = await seedDrop(db(), {
				slug: 'batch-ready-drop',
				launchAt: new Date(now.getTime() - 60 * 1000),
				sortOrder: 0
			});
			const invalidDrop = await seedDrop(db(), {
				slug: 'batch-invalid-drop',
				launchAt: new Date(now.getTime() - 30 * 1000),
				sortOrder: 1
			});
			await seedDrop(db(), {
				slug: 'batch-future-drop',
				launchAt: new Date(now.getTime() + 60 * 1000),
				sortOrder: 2
			});
			const product = await seedDropProduct({ slug: 'batch-ready-product' });
			await setDropProducts(adminCtx(), { dropId: readyDrop.id, productIds: [product.id] });

			const result = await transitionDueDropsToLive(adminCtx(), { now, limit: 10 });

			expect(result).toMatchObject({
				launchedCount: 1,
				skippedCount: 1,
				failedCount: 0,
				limit: 10
			});
			expect(result.launched.map((item) => item.dropId)).toEqual([readyDrop.id]);
			expect(result.skipped.map((item) => item.dropId)).toEqual([invalidDrop.id]);
			expect(result.skipped[0].errorCode).toBe(ErrorCode.CONFLICT);
			const [updatedReady] = await db().select().from(drop).where(eq(drop.id, readyDrop.id));
			const [updatedInvalid] = await db().select().from(drop).where(eq(drop.id, invalidDrop.id));
			expect(updatedReady.status).toBe('live');
			expect(updatedInvalid.status).toBe('teaser');
		});
	});

	describe('drop waitlist workflows', () => {
		it('joins teaser waitlists, normalizes email contacts, and links existing guest rows to users', async () => {
			const user = await seedUser(db(), { id: 'waitlist-user' });
			const dropRow = await seedDrop(db(), { slug: 'waitlist-drop', status: 'teaser' });

			const guestEntry = await joinDropWaitlist(null, {
				dropId: dropRow.id,
				contact: ' FAN@EXAMPLE.TEST ',
				contactType: 'email'
			});
			expect(guestEntry).toMatchObject({
				contact: 'fan@example.test',
				contactType: 'email',
				userId: null
			});

			const linkedEntry = await joinDropWaitlist(makeCustomerCtx(user.id), {
				dropId: dropRow.id,
				contact: 'fan@example.test',
				contactType: 'email'
			});
			expect(linkedEntry.id).toBe(guestEntry.id);
			expect(linkedEntry.userId).toBe(user.id);
			expect(await waitlistRows(dropRow.id)).toHaveLength(1);
		});

		it('rejects new waitlist entries for non-teaser drops and invalid contacts', async () => {
			const liveDrop = await seedDrop(db(), { slug: 'live-waitlist-drop', status: 'live' });
			const teaserDrop = await seedDrop(db(), { slug: 'invalid-contact-drop', status: 'teaser' });

			await expect(
				joinDropWaitlist(null, {
					dropId: liveDrop.id,
					contact: 'fan@example.test',
					contactType: 'email'
				})
			).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

			await expect(
				joinDropWaitlist(null, {
					dropId: teaserDrop.id,
					contact: 'not-an-email',
					contactType: 'email'
				})
			).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
		});

		it('links waitlist contacts to an owning user and skips contacts owned by another user', async () => {
			const targetUser = await seedUser(db(), { id: 'target-user' });
			const otherUser = await seedUser(db(), { id: 'other-user' });
			const dropRow = await seedDrop(db(), { slug: 'link-contacts-drop' });
			await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: 'guest@example.test',
				contactType: 'email',
				userId: null
			});
			await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: '+94770000001',
				contactType: 'phone',
				userId: otherUser.id
			});

			const result = await linkDropWaitlistEntriesToUser(makeCustomerCtx(targetUser.id), {
				userId: targetUser.id,
				contacts: [' GUEST@EXAMPLE.TEST ', '+94770000001']
			});
			expect(result).toEqual({
				targetUserId: targetUser.id,
				matchedCount: 2,
				linkedCount: 1,
				skippedCount: 1
			});

			await expect(
				linkDropWaitlistEntriesToUser(makeCustomerCtx(otherUser.id), {
					userId: targetUser.id,
					contacts: ['guest@example.test']
				})
			).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
		});

		it('moves waitlist entries from one user to another in auth-link workflows', async () => {
			const sourceUser = await seedUser(db(), { id: 'source-user' });
			const targetUser = await seedUser(db(), { id: 'merged-user' });
			const dropRow = await seedDrop(db(), { slug: 'merge-user-drop' });
			await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: 'source@example.test',
				contactType: 'email',
				userId: sourceUser.id
			});

			const result = await linkDropWaitlistEntriesFromUserToUser(makeCustomerCtx(targetUser.id), {
				sourceUserId: sourceUser.id,
				targetUserId: targetUser.id
			});

			expect(result).toEqual({
				targetUserId: targetUser.id,
				matchedCount: 1,
				linkedCount: 1,
				skippedCount: 0
			});
			const rows = await waitlistRows(dropRow.id);
			expect(rows[0].userId).toBe(targetUser.id);
		});

		it('lists unnotified entries and marks notification state idempotently', async () => {
			const dropRow = await seedDrop(db(), { slug: 'mark-waitlist-drop' });
			const first = await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: 'first@example.test',
				contactType: 'email'
			});
			const second = await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: '+94770000002',
				contactType: 'phone'
			});
			const alreadyNotified = await seedDropWaitlistEntry(db(), dropRow.id, {
				contact: 'done@example.test',
				contactType: 'email',
				notifiedAt: new Date(now.getTime() - 60 * 1000)
			});

			const list = await listDropWaitlistEntries(adminCtx(), { dropId: dropRow.id, limit: 10 });
			expect(list.total).toBe(3);

			const unnotified = await listUnnotifiedDropWaitlistEntries(adminCtx(), {
				dropId: dropRow.id,
				limit: 10
			});
			expect(unnotified.map((entry) => entry.id).sort()).toEqual([first.id, second.id].sort());

			const marked = await markDropWaitlistEntriesNotified(adminCtx(), {
				entryIds: [first.id, second.id, alreadyNotified.id, first.id],
				notifiedAt: now
			});
			expect(marked).toEqual({
				requestedCount: 4,
				markedCount: 2,
				notifiedAt: now
			});

			const markedAgain = await markDropWaitlistEntryNotified(adminCtx(), {
				entryId: first.id,
				notifiedAt: now
			});
			expect(markedAgain.markedCount).toBe(0);
			expect(
				await db()
					.select()
					.from(dropWaitlist)
					.where(and(eq(dropWaitlist.dropId, dropRow.id), isNull(dropWaitlist.notifiedAt)))
			).toHaveLength(0);
		});
	});
});
