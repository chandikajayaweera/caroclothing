import { and, asc, eq, inArray, max, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '$lib/server/db';
import {
	guardBatchCondition,
	guardPreviousBatchChanges,
	isD1BatchGuardError
} from '$lib/server/db/batch';
import {
	rethrowTransientD1Error,
	withTransientD1ReadRetry,
	withTransientD1WriteReconciliation
} from '$lib/server/db/retry';
import type { ServiceContext } from '$lib/server/foundation/context';
import { requireAdmin } from '$lib/server/foundation/guards';
import {
	isCheckConstraintError,
	isForeignKeyConstraintError,
	isUniqueConstraintError
} from '$lib/server/foundation/utils';
import {
	getErrorMessage,
	isAppError,
	ErrorCode,
	MediaError,
	StorefrontError
} from '$lib/server/infrastructure/errors';
import {
	buildMediaKey,
	deleteObjectSafe,
	getMediaBucket,
	isInvalidImageUploadMessage,
	uploadImage,
	type StoredImageMetadata
} from '$lib/server/infrastructure/media/r2';
import { mediaOriginalUrl } from '$lib/shared/media';
import { getInventoryAvailabilityByVariantIds } from '../inventory';
import {
	getCategory,
	getProduct,
	listCategories,
	listProducts,
	toPublicCategoryDTO,
	toPublicProductDTO
} from '../products';
import type { PublicProductDTO } from '../products/products.types';
import { getPromotion, getPublicPromotion, listPromotions } from '../promotions';
import { listRecentApprovedReviews } from '../reviews';
import { getShippingMethod, listShippingMethods, listShippingQuotes } from '../shipping';
import {
	insertStorefrontSectionSchema,
	storefrontSection,
	storefrontSectionCategory,
	storefrontSectionMedia,
	type NewStorefrontSection,
	type NewStorefrontSectionMedia,
	type StorefrontSection,
	type StorefrontSectionMedia
} from './storefront.drizzle';
import type {
	AdminStorefrontSectionDTO,
	CreateStorefrontSectionInput,
	HomePageDTO,
	HomePageSectionDTO,
	PublicStorefrontSectionBaseDTO,
	ReorderStorefrontSectionsInput,
	StorefrontEditorOptionsDTO,
	StorefrontProductDTO,
	StorefrontSectionBaseDTO,
	StorefrontSectionMediaDTO,
	UpdateStorefrontSectionInput
} from './storefront.types';

type Db = ReturnType<typeof getDb>;
type BatchItem = Parameters<Db['batch']>[0][number];
type UploadedSectionMedia = StoredImageMetadata & { bucket: R2Bucket; role: 'desktop' | 'mobile' };
type HomeHydrationCache = {
	spotlightProducts: Map<string, Promise<StorefrontProductDTO | null>>;
	productGrids: Map<string, Promise<StorefrontProductDTO[]>>;
	categories: Map<'all', ReturnType<typeof listCategories>>;
	promotions: Map<string, ReturnType<typeof getPublicPromotion>>;
	shippingQuotes: Map<'all', ReturnType<typeof listShippingQuotes>>;
	reviews: Map<number, Promise<HomePageSectionDTO['reviews']>>;
};

const allowedSources: Record<
	StorefrontSection['type'],
	ReadonlySet<StorefrontSection['sourceType']>
> = {
	hero: new Set(['manual', 'promotion']),
	product_grid: new Set(['new_arrivals', 'featured_products', 'category_products']),
	product_spotlight: new Set(['manual']),
	category_showcase: new Set(['manual', 'root_categories']),
	promotion_campaign: new Set(['promotion']),
	service_strip: new Set(['manual', 'shipping']),
	review_rail: new Set(['recent_reviews'])
};

export async function getHomePage(ctx: ServiceContext): Promise<HomePageDTO> {
	const now = ctx.now ?? new Date();
	const db = getDb();
	const rows = await withTransientD1ReadRetry(() =>
		db
			.select()
			.from(storefrontSection)
			.where(
				and(
					eq(storefrontSection.pageKey, 'home'),
					eq(storefrontSection.enabled, true),
					sql`(${storefrontSection.startsAt} IS NULL OR ${storefrontSection.startsAt} <= ${now.getTime()})`,
					sql`(${storefrontSection.endsAt} IS NULL OR ${storefrontSection.endsAt} > ${now.getTime()})`
				)
			)
			.orderBy(asc(storefrontSection.sortOrder), asc(storefrontSection.id))
	);

	const sectionIds = rows.map((row) => row.id);
	const mediaBySection = await withTransientD1ReadRetry(() =>
		loadMediaBySectionIds(db, sectionIds)
	);
	const categoryIdsBySection = await withTransientD1ReadRetry(() =>
		loadCategoryIdsBySectionIds(db, sectionIds)
	);
	const hydrationCache = createHomeHydrationCache();
	const sections: HomePageSectionDTO[] = [];
	for (const row of rows) {
		sections.push(
			await hydrateHomeSection(
				ctx,
				row,
				mediaBySection.get(row.id) ?? [],
				categoryIdsBySection.get(row.id) ?? [],
				now,
				hydrationCache
			)
		);
	}
	return { sections, generatedAt: now };
}

export async function listStorefrontSections(
	ctx: ServiceContext,
	input: { pageKey?: StorefrontSection['pageKey'] } = {}
): Promise<AdminStorefrontSectionDTO[]> {
	requireAdmin(ctx.actor);
	const now = ctx.now ?? new Date();
	const rows = await withTransientD1ReadRetry(() =>
		getDb()
			.select()
			.from(storefrontSection)
			.where(eq(storefrontSection.pageKey, input.pageKey ?? 'home'))
			.orderBy(asc(storefrontSection.sortOrder), asc(storefrontSection.id))
	);
	return hydrateAdminSections(rows, now);
}

export async function getStorefrontSection(
	ctx: ServiceContext,
	input: { sectionId: string }
): Promise<AdminStorefrontSectionDTO> {
	requireAdmin(ctx.actor);
	const id = normalizeId(input.sectionId, 'sectionId');
	const [row] = await withTransientD1ReadRetry(() =>
		getDb().select().from(storefrontSection).where(eq(storefrontSection.id, id)).limit(1)
	);
	if (!row) throw notFound(id);
	return (await hydrateAdminSections([row], ctx.now ?? new Date()))[0]!;
}

export async function getStorefrontEditorOptions(
	ctx: ServiceContext
): Promise<StorefrontEditorOptionsDTO> {
	requireAdmin(ctx.actor);
	const products = await listProducts(ctx, { includeInactive: true, limit: 100 });
	const categories = await listCategories(ctx, { includeInactive: true, limit: 150 });
	const promotions = await listPromotions(ctx, { includeInactive: true, limit: 100 });
	const shippingMethods = await listShippingMethods(ctx, { limit: 100 });
	return {
		products: products.items.map(({ id, name, slug, isActive }) => ({ id, name, slug, isActive })),
		categories: categories.map(({ id, name, slug, parentId, isActive }) => ({
			id,
			name,
			slug,
			parentId,
			isActive
		})),
		promotions: promotions.items.map(({ id, name, status, visibility }) => ({
			id,
			name,
			status,
			visibility
		})),
		shippingMethods: shippingMethods.items.map(({ id, name, isActive }) => ({ id, name, isActive }))
	};
}

export async function createStorefrontSection(
	ctx: ServiceContext,
	input: CreateStorefrontSectionInput
): Promise<AdminStorefrontSectionDTO> {
	requireAdmin(ctx.actor);
	const now = ctx.now ?? new Date();
	const sectionId = nanoid();
	const parsed = parseSectionInput(input);
	assertAllowedSource(parsed.type, parsed.sourceType);
	await assertReferences(ctx, parsed);
	const sortOrder = await nextSortOrder(parsed.pageKey ?? 'home');
	const uploaded = await uploadInputMedia(ctx, sectionId, input);
	const values = toSectionValues(sectionId, { ...parsed, sortOrder }, now);
	const statements: [BatchItem, ...BatchItem[]] = [
		getDb().insert(storefrontSection).values(values)
	];
	statements.push(...categoryInsertStatements(getDb(), sectionId, input.categoryIds ?? []));
	statements.push(
		...uploaded.map((item) =>
			getDb()
				.insert(storefrontSectionMedia)
				.values(toMediaValues(sectionId, item, input, now))
		)
	);

	try {
		const db = getDb();
		await withTransientD1WriteReconciliation(
			async () => {
				await db.batch(statements);
			},
			async () => {
				const [row] = await db
					.select({ id: storefrontSection.id })
					.from(storefrontSection)
					.where(eq(storefrontSection.id, sectionId))
					.limit(1);
				if (!row) return { committed: false };
				if (uploaded.length > 0) {
					const storedMedia = await db
						.select({ r2Key: storefrontSectionMedia.r2Key })
						.from(storefrontSectionMedia)
						.where(eq(storefrontSectionMedia.sectionId, sectionId));
					const storedKeys = new Set(storedMedia.map((item) => item.r2Key));
					if (!uploaded.every((item) => storedKeys.has(item.key))) {
						return { committed: false };
					}
				}
				return { committed: true, value: undefined };
			}
		);
		return getStorefrontSection(ctx, { sectionId });
	} catch (error) {
		await cleanupUnreferencedUploads(uploaded);
		throw mapPersistenceError(error);
	}
}

export async function updateStorefrontSection(
	ctx: ServiceContext,
	input: { sectionId: string; data: UpdateStorefrontSectionInput }
): Promise<AdminStorefrontSectionDTO> {
	requireAdmin(ctx.actor);
	const now = ctx.now ?? new Date();
	const existing = await getStorefrontSection(ctx, { sectionId: input.sectionId });
	const merged = parseSectionInput({
		...existing,
		...input.data,
		pageKey: existing.pageKey,
		sortOrder: existing.sortOrder,
		startsAt:
			input.data.startsAt === undefined
				? (existing.startsAt?.getTime() ?? null)
				: input.data.startsAt,
		endsAt:
			input.data.endsAt === undefined ? (existing.endsAt?.getTime() ?? null) : input.data.endsAt
	});
	assertAllowedSource(merged.type, merged.sourceType);
	await assertReferences(ctx, merged);
	const uploaded = await uploadInputMedia(ctx, existing.id, input.data);
	const oldMediaByRole = new Map(existing.media.map((item) => [item.role, item]));
	const statements: [BatchItem, ...BatchItem[]] = [
		getDb()
			.update(storefrontSection)
			.set({
				...toSectionValues(existing.id, merged, now),
				id: undefined,
				createdAt: undefined,
				sortOrder: undefined,
				updatedAt: now
			})
			.where(
				and(
					eq(storefrontSection.id, existing.id),
					or(
						eq(storefrontSection.updatedAt, existing.updatedAt),
						eq(storefrontSection.updatedAt, now)
					)
				)
			),
		...guardPreviousBatchChanges(getDb())
	];
	if (input.data.categoryIds) {
		statements.push(
			getDb()
				.delete(storefrontSectionCategory)
				.where(eq(storefrontSectionCategory.sectionId, existing.id))
		);
		statements.push(...categoryInsertStatements(getDb(), existing.id, input.data.categoryIds));
	}
	const rolesToRemove = new Set<'desktop' | 'mobile'>();
	if (input.data.removeDesktopImage || uploaded.some((item) => item.role === 'desktop'))
		rolesToRemove.add('desktop');
	if (input.data.removeMobileImage || uploaded.some((item) => item.role === 'mobile'))
		rolesToRemove.add('mobile');
	for (const role of rolesToRemove)
		statements.push(
			getDb()
				.delete(storefrontSectionMedia)
				.where(
					and(
						eq(storefrontSectionMedia.sectionId, existing.id),
						eq(storefrontSectionMedia.role, role)
					)
				)
		);
	for (const item of uploaded)
		statements.push(
			getDb()
				.insert(storefrontSectionMedia)
				.values(toMediaValues(existing.id, item, input.data, now))
		);
	for (const role of ['desktop', 'mobile'] as const) {
		if (rolesToRemove.has(role)) continue;
		const old = oldMediaByRole.get(role);
		if (!old) continue;
		const altText = role === 'desktop' ? input.data.desktopAltText : input.data.mobileAltText;
		const focalX = role === 'desktop' ? input.data.desktopFocalX : input.data.mobileFocalX;
		const focalY = role === 'desktop' ? input.data.desktopFocalY : input.data.mobileFocalY;
		if (altText !== undefined || focalX !== undefined || focalY !== undefined) {
			statements.push(
				getDb()
					.update(storefrontSectionMedia)
					.set({
						altText: altText === undefined ? old.altText : altText,
						focalX: focalX ?? old.focalX,
						focalY: focalY ?? old.focalY
					})
					.where(eq(storefrontSectionMedia.id, old.id))
			);
		}
	}

	const deleteReplacedMedia = async () => {
		const bucket = uploaded[0]?.bucket ?? optionalMediaBucket(ctx);
		if (!bucket) return;
		await Promise.all(
			[...rolesToRemove].map((role) => deleteObjectSafe(bucket, oldMediaByRole.get(role)?.r2Key))
		);
	};

	let updated: AdminStorefrontSectionDTO;
	try {
		updated = await withTransientD1WriteReconciliation<AdminStorefrontSectionDTO>(
			async () => {
				await getDb().batch(statements);
				return getStorefrontSection(ctx, { sectionId: existing.id });
			},
			async () => {
				const current = await getStorefrontSection(ctx, { sectionId: existing.id });
				if (current.updatedAt.getTime() !== now.getTime()) return { committed: false };
				if (
					uploaded.some(
						(item) =>
							!current.media.some((media) => media.role === item.role && media.r2Key === item.key)
					)
				) {
					return { committed: false };
				}
				if (
					input.data.categoryIds &&
					!sameOrderedIds(current.categoryIds, input.data.categoryIds)
				) {
					return { committed: false };
				}
				return { committed: true, value: current };
			}
		);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			await cleanupUnreferencedUploads(uploaded);
			throw new StorefrontError(
				'Storefront section changed while it was being saved. Refresh and try again.',
				ErrorCode.CONFLICT,
				{ sectionId: existing.id }
			);
		}
		await cleanupUnreferencedUploads(uploaded);
		throw mapPersistenceError(error);
	}
	await deleteReplacedMedia();
	return updated;
}

export async function setStorefrontSectionEnabled(
	ctx: ServiceContext,
	input: { sectionId: string; enabled: boolean }
): Promise<AdminStorefrontSectionDTO> {
	requireAdmin(ctx.actor);
	const id = normalizeId(input.sectionId, 'sectionId');
	const now = ctx.now ?? new Date();
	const existing = await getStorefrontSection(ctx, { sectionId: id });
	if (existing.enabled === input.enabled) return existing;
	const db = getDb();
	return withTransientD1WriteReconciliation<AdminStorefrontSectionDTO>(
		async () => {
			const [row] = await db
				.update(storefrontSection)
				.set({ enabled: input.enabled, updatedAt: now })
				.where(
					and(eq(storefrontSection.id, id), eq(storefrontSection.updatedAt, existing.updatedAt))
				)
				.returning({ id: storefrontSection.id });
			if (!row) {
				throw new StorefrontError(
					'Storefront section changed while it was being updated.',
					ErrorCode.CONFLICT,
					{ sectionId: id }
				);
			}
			return getStorefrontSection(ctx, { sectionId: id });
		},
		async () => {
			const current = await getStorefrontSection(ctx, { sectionId: id });
			return current.enabled === input.enabled && current.updatedAt.getTime() === now.getTime()
				? { committed: true, value: current }
				: { committed: false };
		}
	);
}

export async function reorderStorefrontSections(
	ctx: ServiceContext,
	input: ReorderStorefrontSectionsInput
): Promise<AdminStorefrontSectionDTO[]> {
	requireAdmin(ctx.actor);
	const pageKey = input.pageKey ?? 'home';
	const sectionIds = input.sectionIds.map((id) => normalizeId(id, 'sectionId'));
	if (new Set(sectionIds).size !== sectionIds.length)
		throw new StorefrontError('Section order contains duplicates.', ErrorCode.VALIDATION_ERROR);
	const existing = await getDb()
		.select({ id: storefrontSection.id })
		.from(storefrontSection)
		.where(eq(storefrontSection.pageKey, pageKey));
	if (
		existing.length !== sectionIds.length ||
		existing.some((row) => !sectionIds.includes(row.id))
	) {
		throw new StorefrontError(
			'Section order must contain every section on the page exactly once.',
			ErrorCode.VALIDATION_ERROR
		);
	}
	if (!sectionIds.length) return [];
	const db = getDb();
	const now = ctx.now ?? new Date();
	const membershipGuard = guardBatchCondition(
		db,
		sql`(SELECT count(*) FROM ${storefrontSection} WHERE ${storefrontSection.pageKey} = ${pageKey}) = ${sectionIds.length}
			AND NOT EXISTS (
				SELECT 1 FROM ${storefrontSection}
				WHERE ${storefrontSection.pageKey} = ${pageKey}
					AND ${storefrontSection.id} NOT IN (${sql.join(
						sectionIds.map((id) => sql`${id}`),
						sql`, `
					)})
			)`
	);
	const updates: BatchItem[] = [];
	for (const [index, id] of sectionIds.entries())
		updates.push(
			db
				.update(storefrontSection)
				.set({ sortOrder: 1_000_000 + index })
				.where(and(eq(storefrontSection.id, id), eq(storefrontSection.pageKey, pageKey)))
		);
	for (const [index, id] of sectionIds.entries())
		updates.push(
			db
				.update(storefrontSection)
				.set({ sortOrder: index, updatedAt: now })
				.where(and(eq(storefrontSection.id, id), eq(storefrontSection.pageKey, pageKey)))
		);
	const statements = [...membershipGuard, ...updates] as [BatchItem, ...BatchItem[]];
	try {
		await withTransientD1WriteReconciliation(
			async () => {
				await db.batch(statements);
			},
			async () => {
				const rows = await db
					.select({
						id: storefrontSection.id,
						sortOrder: storefrontSection.sortOrder,
						updatedAt: storefrontSection.updatedAt
					})
					.from(storefrontSection)
					.where(eq(storefrontSection.pageKey, pageKey))
					.orderBy(asc(storefrontSection.sortOrder));
				return rows.length === sectionIds.length &&
					rows.every(
						(row, index) =>
							row.id === sectionIds[index] &&
							row.sortOrder === index &&
							row.updatedAt.getTime() === now.getTime()
					)
					? { committed: true, value: undefined }
					: { committed: false };
			}
		);
	} catch (error) {
		if (isD1BatchGuardError(error)) {
			throw new StorefrontError(
				'Storefront sections changed while they were being reordered. Refresh and try again.',
				ErrorCode.CONFLICT
			);
		}
		throw mapPersistenceError(error);
	}
	return listStorefrontSections(ctx, { pageKey });
}

export async function deleteStorefrontSection(
	ctx: ServiceContext,
	input: { sectionId: string }
): Promise<void> {
	requireAdmin(ctx.actor);
	const existing = await getStorefrontSection(ctx, input);
	const db = getDb();
	await withTransientD1WriteReconciliation(
		async () => {
			const [deleted] = await db
				.delete(storefrontSection)
				.where(
					and(
						eq(storefrontSection.id, existing.id),
						eq(storefrontSection.updatedAt, existing.updatedAt)
					)
				)
				.returning({ id: storefrontSection.id });
			if (!deleted) {
				throw new StorefrontError(
					'Storefront section changed before it could be deleted.',
					ErrorCode.CONFLICT,
					{ sectionId: existing.id }
				);
			}
		},
		async () => {
			const [row] = await db
				.select({ id: storefrontSection.id })
				.from(storefrontSection)
				.where(eq(storefrontSection.id, existing.id))
				.limit(1);
			return row ? { committed: false } : { committed: true, value: undefined };
		}
	);
	const bucket = optionalMediaBucket(ctx);
	if (bucket) await Promise.all(existing.media.map((item) => deleteObjectSafe(bucket, item.r2Key)));
}

async function hydrateHomeSection(
	ctx: ServiceContext,
	row: StorefrontSection,
	media: StorefrontSectionMedia[],
	categoryIds: string[],
	now: Date,
	cache: HomeHydrationCache
): Promise<HomePageSectionDTO> {
	let product: StorefrontProductDTO | null = null;
	let products: StorefrontProductDTO[] = [];
	let categories = [] as HomePageSectionDTO['categories'];
	let promotionDto: HomePageSectionDTO['promotion'] = null;
	let shipping: HomePageSectionDTO['shipping'] = null;
	let reviews: HomePageSectionDTO['reviews'] = [];

	if (row.type === 'product_spotlight' && row.productId) {
		product = await memoizeAsync(cache.spotlightProducts, row.productId, async () => {
			try {
				return (
					(
						await withAvailability(ctx, [
							toPublicProductDTO(await getProduct(ctx, { id: row.productId! }))
						])
					)[0] ?? null
				);
			} catch (error) {
				if (!isAppError(error) || error.statusCode >= 500) throw error;
				return null;
			}
		});
	}
	if (row.type === 'product_grid') {
		const cacheKey = [row.sourceType, row.categoryId ?? '', row.itemLimit].join(':');
		products = await memoizeAsync(cache.productGrids, cacheKey, async () => {
			const result = await listProducts(ctx, {
				includeInactive: false,
				isNewArrival: row.sourceType === 'new_arrivals' ? true : undefined,
				isFeatured: row.sourceType === 'featured_products' ? true : undefined,
				categoryId: row.sourceType === 'category_products' ? row.categoryId : undefined,
				limit: row.itemLimit
			});
			return withAvailability(ctx, result.items.map(toPublicProductDTO));
		});
	}
	if (row.type === 'category_showcase') {
		const all = await memoizeAsync(cache.categories, 'all', () =>
			listCategories(ctx, { includeInactive: false, limit: 150 })
		);
		categories =
			row.sourceType === 'root_categories'
				? all
						.filter((item) => item.parentId === null)
						.slice(0, row.itemLimit)
						.map(toPublicCategoryDTO)
				: categoryIds
						.map((id) => all.find((item) => item.id === id))
						.filter((item): item is NonNullable<typeof item> => Boolean(item))
						.slice(0, row.itemLimit)
						.map(toPublicCategoryDTO);
	}
	if ((row.type === 'promotion_campaign' || row.sourceType === 'promotion') && row.promotionId) {
		const promotionId = row.promotionId;
		const p = await memoizeAsync(cache.promotions, promotionId, () =>
			getPublicPromotion({ promotionId, now })
		);
		if (p)
			promotionDto = {
				id: p.id,
				title: p.publicTitle ?? p.name,
				description: p.publicDescription,
				discountType: p.discountType,
				discountValue: p.discountValue
			};
	}
	if (row.type === 'service_strip' && row.sourceType === 'shipping' && row.shippingMethodId) {
		const quotes = await memoizeAsync(cache.shippingQuotes, 'all', () =>
			listShippingQuotes({ subtotal: 0 })
		);
		shipping = quotes.find((item) => item.shippingMethodId === row.shippingMethodId) ?? null;
	}
	if (row.type === 'review_rail')
		reviews = await memoizeAsync(cache.reviews, row.itemLimit, async () => {
			return (await listRecentApprovedReviews({ limit: row.itemLimit })).items;
		});
	return {
		...toPublicSectionBaseDTO(row, media),
		product,
		products,
		categories,
		promotion: promotionDto,
		shipping,
		reviews
	};
}

async function withAvailability(
	ctx: ServiceContext,
	products: PublicProductDTO[]
): Promise<StorefrontProductDTO[]> {
	const variantIds = products.flatMap((item) => item.variants.map((variant) => variant.id));
	const availability = variantIds.length
		? await getInventoryAvailabilityByVariantIds(ctx, { variantIds })
		: [];
	const byVariant = new Map(availability.map((item) => [item.variantId, item]));
	return products.map((item) => {
		let totalStock = 0;
		let tracksInventory = false;
		let untrackedAvailable = false;
		for (const variant of item.variants) {
			const stock = byVariant.get(variant.id);
			if (!stock) continue;
			if (stock.trackInventory) {
				tracksInventory = true;
				totalStock += stock.availableQuantity;
			} else untrackedAvailable = true;
		}
		const hasAvailable = untrackedAvailable || !tracksInventory || totalStock > 0;
		return {
			...item,
			totalStock,
			hasAvailable,
			stockStatus: !hasAvailable
				? 'sold-out'
				: tracksInventory && totalStock < 5
					? 'low-stock'
					: 'available'
		};
	});
}

async function hydrateAdminSections(rows: StorefrontSection[], now: Date) {
	const sectionIds = rows.map((row) => row.id);
	const db = getDb();
	const media = await withTransientD1ReadRetry(() => loadMediaBySectionIds(db, sectionIds));
	const categories = await withTransientD1ReadRetry(() =>
		loadCategoryIdsBySectionIds(db, sectionIds)
	);
	return rows.map(
		(row): AdminStorefrontSectionDTO => ({
			...toSectionBaseDTO(row, media.get(row.id) ?? []),
			productId: row.productId,
			categoryId: row.categoryId,
			promotionId: row.promotionId,
			shippingMethodId: row.shippingMethodId,
			categoryIds: categories.get(row.id) ?? [],
			enabled: row.enabled,
			startsAt: row.startsAt,
			endsAt: row.endsAt,
			visibilityStatus: visibilityStatus(row, now),
			createdAt: row.createdAt,
			updatedAt: row.updatedAt
		})
	);
}

function createHomeHydrationCache(): HomeHydrationCache {
	return {
		spotlightProducts: new Map(),
		productGrids: new Map(),
		categories: new Map(),
		promotions: new Map(),
		shippingQuotes: new Map(),
		reviews: new Map()
	};
}

function memoizeAsync<K, V>(cache: Map<K, Promise<V>>, key: K, load: () => Promise<V>): Promise<V> {
	const existing = cache.get(key);
	if (existing) return existing;
	const pending = load();
	cache.set(key, pending);
	return pending;
}

function toSectionBaseDTO(
	row: StorefrontSection,
	media: StorefrontSectionMedia[]
): StorefrontSectionBaseDTO {
	return {
		id: row.id,
		pageKey: row.pageKey,
		type: row.type,
		adminName: row.adminName,
		layoutVariant: row.layoutVariant,
		sourceType: row.sourceType,
		eyebrow: row.eyebrow,
		title: row.title,
		body: row.body,
		primaryCtaLabel: row.primaryCtaLabel,
		primaryCtaUrl: row.primaryCtaUrl,
		secondaryCtaLabel: row.secondaryCtaLabel,
		secondaryCtaUrl: row.secondaryCtaUrl,
		itemLimit: row.itemLimit,
		sortOrder: row.sortOrder,
		media: media.map(toMediaDTO)
	};
}

function toPublicSectionBaseDTO(
	row: StorefrontSection,
	media: StorefrontSectionMedia[]
): PublicStorefrontSectionBaseDTO {
	const base = toSectionBaseDTO(row, media);
	return {
		...base,
		media: base.media.map(({ mimeType, byteSize, originalFilename, ...item }) => {
			void mimeType;
			void byteSize;
			void originalFilename;
			return item;
		})
	};
}

function toMediaDTO(row: StorefrontSectionMedia): StorefrontSectionMediaDTO {
	return {
		id: row.id,
		role: row.role,
		r2Key: row.r2Key,
		imageUrl: mediaOriginalUrl(row.r2Key),
		mimeType: row.mimeType,
		byteSize: row.byteSize,
		originalFilename: row.originalFilename,
		width: row.width,
		height: row.height,
		altText: row.altText,
		focalX: row.focalX,
		focalY: row.focalY
	};
}

async function loadMediaBySectionIds(tx: Db, ids: string[]) {
	if (!ids.length) return new Map<string, StorefrontSectionMedia[]>();
	const rows = await tx
		.select()
		.from(storefrontSectionMedia)
		.where(inArray(storefrontSectionMedia.sectionId, ids))
		.orderBy(asc(storefrontSectionMedia.role));
	const map = new Map<string, StorefrontSectionMedia[]>();
	for (const row of rows) map.set(row.sectionId, [...(map.get(row.sectionId) ?? []), row]);
	return map;
}

async function loadCategoryIdsBySectionIds(tx: Db, ids: string[]) {
	if (!ids.length) return new Map<string, string[]>();
	const rows = await tx
		.select()
		.from(storefrontSectionCategory)
		.where(inArray(storefrontSectionCategory.sectionId, ids))
		.orderBy(asc(storefrontSectionCategory.position));
	const map = new Map<string, string[]>();
	for (const row of rows)
		map.set(row.sectionId, [...(map.get(row.sectionId) ?? []), row.categoryId]);
	return map;
}

function parseSectionInput(
	input:
		| CreateStorefrontSectionInput
		| (UpdateStorefrontSectionInput & Partial<CreateStorefrontSectionInput>)
) {
	const parsed = insertStorefrontSectionSchema.safeParse({
		pageKey: input.pageKey ?? 'home',
		type: input.type,
		adminName: input.adminName,
		layoutVariant: input.layoutVariant,
		sourceType: input.sourceType,
		eyebrow: emptyToNull(input.eyebrow),
		title: emptyToNull(input.title),
		body: emptyToNull(input.body),
		primaryCtaLabel: emptyToNull(input.primaryCtaLabel),
		primaryCtaUrl: emptyToNull(input.primaryCtaUrl),
		secondaryCtaLabel: emptyToNull(input.secondaryCtaLabel),
		secondaryCtaUrl: emptyToNull(input.secondaryCtaUrl),
		productId: emptyToNull(input.productId),
		categoryId: emptyToNull(input.categoryId),
		promotionId: emptyToNull(input.promotionId),
		shippingMethodId: emptyToNull(input.shippingMethodId),
		itemLimit: input.itemLimit ?? 8,
		sortOrder: input.sortOrder ?? 0,
		enabled: input.enabled ?? false,
		startsAt: input.startsAt ?? null,
		endsAt: input.endsAt ?? null
	});
	if (!parsed.success)
		throw new StorefrontError('Invalid storefront section.', ErrorCode.VALIDATION_ERROR, {
			issues: parsed.error.issues
		});
	return parsed.data;
}

function toSectionValues(
	id: string,
	data: ReturnType<typeof parseSectionInput>,
	now: Date
): NewStorefrontSection {
	return {
		id,
		...data,
		startsAt: data.startsAt ? new Date(data.startsAt) : null,
		endsAt: data.endsAt ? new Date(data.endsAt) : null,
		createdAt: now,
		updatedAt: now
	};
}

function assertAllowedSource(
	type: StorefrontSection['type'],
	source: StorefrontSection['sourceType']
) {
	if (!allowedSources[type].has(source))
		throw new StorefrontError(`${source} is not valid for ${type}.`, ErrorCode.VALIDATION_ERROR);
}

async function assertReferences(ctx: ServiceContext, data: ReturnType<typeof parseSectionInput>) {
	if (data.productId) await getProduct(ctx, { id: data.productId }, { includeInactive: true });
	if (data.categoryId) await getCategory(ctx, { id: data.categoryId }, { includeInactive: true });
	if (data.promotionId) await getPromotion(ctx, { promotionId: data.promotionId });
	if (data.shippingMethodId)
		await getShippingMethod(ctx, { shippingMethodId: data.shippingMethodId });
}

async function nextSortOrder(pageKey: StorefrontSection['pageKey']) {
	const [row] = await getDb()
		.select({ value: max(storefrontSection.sortOrder) })
		.from(storefrontSection)
		.where(eq(storefrontSection.pageKey, pageKey));
	return Number(row?.value ?? -1) + 1;
}

function categoryInsertStatements(db: Db, sectionId: string, ids: string[]): BatchItem[] {
	const unique = [...new Set(ids.map((id) => normalizeId(id, 'categoryId')))];
	if (!unique.length) return [];
	return [
		db
			.insert(storefrontSectionCategory)
			.values(unique.map((categoryId, position) => ({ sectionId, categoryId, position })))
	];
}

async function uploadInputMedia(
	ctx: ServiceContext,
	sectionId: string,
	input: Pick<CreateStorefrontSectionInput, 'desktopImage' | 'mobileImage'>
): Promise<UploadedSectionMedia[]> {
	const candidates = [
		{ role: 'desktop' as const, file: input.desktopImage },
		{ role: 'mobile' as const, file: input.mobileImage }
	].filter((item): item is { role: 'desktop' | 'mobile'; file: File } =>
		Boolean(item.file && item.file.size > 0)
	);
	if (!candidates.length) return [];
	const bucket = requireMediaBucket(ctx);
	const uploaded: UploadedSectionMedia[] = [];
	try {
		for (const item of candidates) {
			const key = buildMediaKey({
				scope: 'banners',
				entityId: sectionId,
				variant: item.role,
				contentType: item.file.type
			});
			uploaded.push({ bucket, role: item.role, ...(await uploadImage(bucket, key, item.file)) });
		}
		return uploaded;
	} catch (error) {
		await cleanupUploads(uploaded);
		if (isAppError(error)) throw error;
		const cause = getErrorMessage(error);
		const code = resolveMediaUploadCode(cause);
		throw new MediaError(
			code === ErrorCode.INVALID_MEDIA_TYPE ? cause : 'Storefront image upload failed.',
			code,
			{ cause }
		);
	}
}

function toMediaValues(
	sectionId: string,
	item: UploadedSectionMedia,
	input: Pick<
		CreateStorefrontSectionInput,
		| 'desktopAltText'
		| 'mobileAltText'
		| 'desktopFocalX'
		| 'desktopFocalY'
		| 'mobileFocalX'
		| 'mobileFocalY'
	>,
	now: Date
): NewStorefrontSectionMedia {
	const desktop = item.role === 'desktop';
	return {
		id: nanoid(),
		sectionId,
		role: item.role,
		r2Key: item.key,
		mimeType: item.mimeType,
		byteSize: item.byteSize,
		originalFilename: item.originalFilename,
		width: null,
		height: null,
		altText: emptyToNull(desktop ? input.desktopAltText : input.mobileAltText),
		focalX: (desktop ? input.desktopFocalX : input.mobileFocalX) ?? 50,
		focalY: (desktop ? input.desktopFocalY : input.mobileFocalY) ?? 50,
		createdAt: now
	};
}

function requireMediaBucket(ctx: ServiceContext) {
	if (!ctx.event)
		throw new MediaError(
			'Request event is required for media changes.',
			ErrorCode.MEDIA_UPLOAD_FAILED
		);
	try {
		return getMediaBucket(ctx.event);
	} catch (error) {
		throw new MediaError('R2 media bucket is not configured.', ErrorCode.MEDIA_UPLOAD_FAILED, {
			cause: getErrorMessage(error)
		});
	}
}
function optionalMediaBucket(ctx: ServiceContext) {
	return ctx.event?.platform?.env?.MEDIA ?? null;
}
async function cleanupUploads(items: UploadedSectionMedia[]) {
	await Promise.all(items.map((item) => deleteObjectSafe(item.bucket, item.key)));
}
async function cleanupUnreferencedUploads(items: UploadedSectionMedia[]) {
	if (items.length === 0) return;
	try {
		const keys = [...new Set(items.map((item) => item.key))];
		const rows = await withTransientD1ReadRetry(() =>
			getDb()
				.select({ r2Key: storefrontSectionMedia.r2Key })
				.from(storefrontSectionMedia)
				.where(inArray(storefrontSectionMedia.r2Key, keys))
		);
		const referencedKeys = new Set(rows.map((row) => row.r2Key));
		await Promise.all(
			items
				.filter((item) => !referencedKeys.has(item.key))
				.map((item) => deleteObjectSafe(item.bucket, item.key))
		);
	} catch {
		// Preserve objects when database commit state cannot be proven.
	}
}
function resolveMediaUploadCode(message: string): ErrorCode {
	return isInvalidImageUploadMessage(message)
		? ErrorCode.INVALID_MEDIA_TYPE
		: ErrorCode.MEDIA_UPLOAD_FAILED;
}
function normalizeId(value: string, field: string) {
	const id = value.trim();
	if (!id || id.length > 255)
		throw new StorefrontError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR);
	return id;
}
function emptyToNull<T extends string>(value: T | null | undefined): T | null {
	return value?.trim() ? (value.trim() as T) : null;
}
function sameOrderedIds(actual: string[], expectedInput: string[]): boolean {
	const expected = [...new Set(expectedInput.map((id) => normalizeId(id, 'categoryId')))];
	return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}
function visibilityStatus(
	row: StorefrontSection,
	now: Date
): AdminStorefrontSectionDTO['visibilityStatus'] {
	if (!row.enabled) return 'disabled';
	if (row.startsAt && row.startsAt > now) return 'scheduled';
	if (row.endsAt && row.endsAt <= now) return 'ended';
	return 'live';
}
function notFound(id: string) {
	return new StorefrontError(
		'Storefront section not found.',
		ErrorCode.STOREFRONT_SECTION_NOT_FOUND,
		{ sectionId: id }
	);
}
function mapPersistenceError(error: unknown): never {
	if (isAppError(error)) throw error;
	const message = getErrorMessage(error);
	rethrowTransientD1Error(error);
	if (isUniqueConstraintError(message))
		throw new StorefrontError(
			'Storefront section order or media role already exists.',
			ErrorCode.CONFLICT
		);
	if (isForeignKeyConstraintError(message))
		throw new StorefrontError(
			'Referenced storefront source was not found.',
			ErrorCode.VALIDATION_ERROR
		);
	if (isCheckConstraintError(message))
		throw new StorefrontError('Invalid storefront section.', ErrorCode.VALIDATION_ERROR);
	throw error;
}
