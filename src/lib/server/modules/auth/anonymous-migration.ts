import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { mergeUserCartIntoUserCartTx, type CartTx } from '$lib/server/modules/cart/cart.service';
import {
	linkDropWaitlistEntriesFromUserToUserTx,
	type DropsTx
} from '$lib/server/modules/drops/drops.service';
import { AuthError, ErrorCode, getErrorMessage, isAppError } from '$lib/server/infrastructure/errors';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	mergeWishlistIntoUserTx,
	type WishlistTx
} from '$lib/server/modules/wishlist/wishlist.service';
import { user as userTable } from './auth.drizzle';

type Db = ReturnType<typeof getDb>;
type AnonymousMigrationTx = Parameters<Parameters<Db['transaction']>[0]>[0];
type AnonymousMigrationUser = {
	id: string;
	isAnonymous: boolean | null;
};

export async function migrateAnonymousUserData(anonymousUserId: string, targetUserId: string) {
	const sourceUserId = normalizeMigrationUserId(anonymousUserId, 'anonymousUserId');
	const destinationUserId = normalizeMigrationUserId(targetUserId, 'targetUserId');

	if (sourceUserId === destinationUserId) return;

	const actor = { id: destinationUserId, role: 'customerUser' } as const;
	const ctx = { actor } satisfies ServiceContext;

	try {
		await getDb().transaction(async (tx) => {
			await assertAnonymousMigrationUsersTx(tx, {
				anonymousUserId: sourceUserId,
				targetUserId: destinationUserId
			});

			await mergeUserCartIntoUserCartTx(tx as CartTx, ctx, { sourceUserId });
			await mergeWishlistIntoUserTx(tx as WishlistTx, ctx, { sourceUserId });
			await linkDropWaitlistEntriesFromUserToUserTx(tx as DropsTx, ctx, {
				sourceUserId,
				targetUserId: destinationUserId
			});
		});
	} catch (error) {
		if (isAppError(error)) throw error;

		throw new AuthError(
			'Unable to migrate anonymous user data.',
			ErrorCode.ANONYMOUS_MIGRATION_FAILED,
			undefined,
			{
				anonymousUserId: sourceUserId,
				targetUserId: destinationUserId,
				cause: getErrorMessage(error)
			}
		);
	}
}

async function assertAnonymousMigrationUsersTx(
	tx: AnonymousMigrationTx,
	input: { anonymousUserId: string; targetUserId: string }
): Promise<void> {
	const sourceUser = await loadMigrationUserTx(tx, input.anonymousUserId, 'anonymousUserId');
	const targetUser = await loadMigrationUserTx(tx, input.targetUserId, 'targetUserId');

	if (sourceUser.isAnonymous !== true) {
		throw new AuthError(
			'Source user is not an anonymous account.',
			ErrorCode.ANONYMOUS_MIGRATION_FAILED,
			undefined,
			{ anonymousUserId: input.anonymousUserId }
		);
	}

	if (targetUser.isAnonymous === true) {
		throw new AuthError(
			'Target user must be a full account.',
			ErrorCode.ANONYMOUS_MIGRATION_FAILED,
			undefined,
			{ targetUserId: input.targetUserId }
		);
	}
}

async function loadMigrationUserTx(
	tx: AnonymousMigrationTx,
	userId: string,
	field: 'anonymousUserId' | 'targetUserId'
): Promise<AnonymousMigrationUser> {
	const [row] = await tx
		.select({
			id: userTable.id,
			isAnonymous: userTable.isAnonymous
		})
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (!row) {
		throw new AuthError(
			'Anonymous migration user not found.',
			ErrorCode.ANONYMOUS_MIGRATION_FAILED,
			undefined,
			{ [field]: userId }
		);
	}

	return row;
}

function normalizeMigrationUserId(userId: string, field: string): string {
	const normalizedUserId = userId.trim();

	if (normalizedUserId.length === 0 || normalizedUserId.length > 255) {
		throw new AuthError(`Invalid ${field}.`, ErrorCode.VALIDATION_ERROR, undefined, {
			[field]: userId
		});
	}

	return normalizedUserId;
}
