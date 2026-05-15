import type { ErrorCode } from '$lib/server/modules/errors';
import type { DropStatus, InsertDrop, UpdateDrop } from './drops.drizzle';
import type { ProductDTO } from '../products/products.types';

export type DropProductAssignmentDTO = {
	dropId: string;
	productId: string;
	isHero: boolean;
	sortOrder: number;
	product: ProductDTO | null;
};

export type DropWaitlistContactType = 'phone' | 'email';

export type DropWaitlistEntryDTO = {
	id: string;
	dropId: string;
	contact: string;
	contactType: DropWaitlistContactType;
	userId: string | null;
	notifiedAt: Date | null;
	createdAt: Date;
};

export type DropDTO = {
	id: string;
	slug: string;
	name: string;
	tagline: string | null;
	description: string | null;
	status: DropStatus;
	launchAt: Date | null;
	endAt: Date | null;
	heroImageR2Key: string | null;
	heroImageUrl: string | null;
	sortOrder: number;
	createdAt: Date;
	updatedAt: Date;
	products: DropProductAssignmentDTO[];
};

export type DropLookup = { id: string; slug?: never } | { id?: never; slug: string };

export type GetDropOptions = {
	includeArchived?: boolean;
};

export type ListDropsOptions = {
	includeArchived?: boolean;
	status?: DropStatus;
	limit?: number;
	offset?: number;
};

export type DropListResult = {
	items: DropDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type CreateDropInput = Omit<InsertDrop, 'heroImageR2Key' | 'status'> & {
	heroImage?: File | null;
};

export type UpdateDropInput = Omit<UpdateDrop, 'heroImageR2Key' | 'status'> & {
	heroImage?: File | null;
	removeHeroImage?: boolean;
};

export type SetDropProductsInput = {
	dropId: string;
	productIds: string[];
};

export type SetDropHeroProductInput = {
	dropId: string;
	productId: string;
};

export type TransitionDropStatusInput = {
	dropId: string;
	toStatus: DropStatus;
	now?: Date;
};

export type TransitionDueDropsToLiveInput = {
	now: Date;
	limit?: number;
};

export type DropLaunchBatchItem = {
	dropId: string;
	slug: string;
	name: string;
	outcome: 'launched' | 'skipped' | 'failed';
	drop?: DropDTO;
	errorCode?: ErrorCode | 'UNKNOWN_ERROR';
	message?: string;
};

export type DropLaunchBatchResult = {
	now: Date;
	limit: number;
	launched: DropLaunchBatchItem[];
	skipped: DropLaunchBatchItem[];
	failed: DropLaunchBatchItem[];
	launchedCount: number;
	skippedCount: number;
	failedCount: number;
};

export type JoinDropWaitlistInput = {
	dropId: string;
	contact: string;
	contactType: DropWaitlistContactType;
};

export type LinkDropWaitlistEntriesToUserInput = {
	userId: string;
	contacts: string[];
};

export type LinkDropWaitlistEntriesFromUserToUserInput = {
	sourceUserId: string;
	targetUserId: string;
};

export type DropWaitlistLinkResult = {
	targetUserId: string;
	matchedCount: number;
	linkedCount: number;
	skippedCount: number;
};

export type ListDropWaitlistEntriesInput = {
	dropId: string;
	limit?: number;
	offset?: number;
};

export type DropWaitlistEntryListResult = {
	items: DropWaitlistEntryDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type ListUnnotifiedDropWaitlistEntriesInput = {
	dropId: string;
	limit?: number;
};

export type MarkDropWaitlistEntriesNotifiedInput = {
	entryIds: string[];
	notifiedAt?: Date;
};

export type MarkDropWaitlistEntryNotifiedInput = {
	entryId: string;
	notifiedAt?: Date;
};

export type DropWaitlistMarkResult = {
	requestedCount: number;
	markedCount: number;
	notifiedAt: Date;
};
