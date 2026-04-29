import { mergeUserCartIntoUserCart } from '$lib/server/modules/cart/cart.service';
import { linkDropWaitlistEntriesFromUserToUser } from '$lib/server/modules/drops/waitlist.service';
import { CartError, ErrorCode, getErrorMessage, isAppError } from '$lib/server/modules/errors';
import { mergeWishlistIntoUser } from '$lib/server/modules/wishlist/wishlist.service';

export async function migrateAnonymousUserData(anonymousUserId: string, targetUserId: string) {
	if (anonymousUserId === targetUserId) return;

	const actor = { id: targetUserId, role: 'customerUser' } as const;

	try {
		await Promise.all([
			mergeUserCartIntoUserCart(anonymousUserId, { actor }),
			mergeWishlistIntoUser(anonymousUserId, { actor }),
			linkDropWaitlistEntriesFromUserToUser(anonymousUserId, { userId: targetUserId }, { actor })
		]);
	} catch (error) {
		if (isAppError(error)) throw error;

		throw new CartError(
			'Unable to migrate anonymous user data.',
			ErrorCode.ANONYMOUS_MIGRATION_FAILED,
			{
				anonymousUserId,
				targetUserId,
				cause: getErrorMessage(error)
			}
		);
	}
}
