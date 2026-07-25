import { eq } from 'drizzle-orm';
import { getD1Database, getDb } from '$lib/server/db';
import { prepareAnonymousBagMergeStatements } from '$lib/server/modules/bag/bag.service';
import {
	AuthError,
	ErrorCode,
	getErrorMessage,
	isAppError
} from '$lib/server/infrastructure/errors';
import { prepareAnonymousWishlistMergeStatements } from '$lib/server/modules/wishlist/wishlist.service';
import { user as userTable } from './auth.drizzle';

type Db = ReturnType<typeof getDb>;
type AnonymousMigrationTx = Db;
type AnonymousMigrationUser = {
	id: string;
	isAnonymous: boolean | null;
};

export async function migrateAnonymousUserData(anonymousUserId: string, targetUserId: string) {
	const sourceUserId = normalizeMigrationUserId(anonymousUserId, 'anonymousUserId');
	const destinationUserId = normalizeMigrationUserId(targetUserId, 'targetUserId');

	if (sourceUserId === destinationUserId) return;

	try {
		const db = getDb();
		await assertAnonymousMigrationUsersTx(db, {
			anonymousUserId: sourceUserId,
			targetUserId: destinationUserId
		});
		const d1 = getD1Database();
		await d1.batch([
			...prepareAnonymousBagMergeStatements(d1, {
				sourceUserId,
				targetUserId: destinationUserId
			}),
			...prepareAnonymousWishlistMergeStatements(d1, {
				sourceUserId,
				targetUserId: destinationUserId
			})
		]);
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
