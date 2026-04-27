import { and, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { cart, cartItem } from '$lib/server/db/schema';
import { CartError, ErrorCode, getErrorMessage, isAppError } from '$lib/server/modules/errors';

const MAX_CART_ITEM_QUANTITY = 10;

export async function migrateAnonymousUserData(anonymousUserId: string, targetUserId: string) {
	if (anonymousUserId === targetUserId) return;

	const db = getDb();

	try {
		await db.transaction(async (tx) => {
			const [existingTargetCart] = await tx
				.select()
				.from(cart)
				.where(eq(cart.userId, targetUserId))
				.limit(1);

			let targetCartId = existingTargetCart?.id;

			const sourceCarts = await tx.select().from(cart).where(eq(cart.userId, anonymousUserId));

			for (const sourceCart of sourceCarts) {
				if (!targetCartId) {
					await tx
						.update(cart)
						.set({
							userId: targetUserId,
							sessionToken: null,
							expiresAt: null
						})
						.where(eq(cart.id, sourceCart.id));

					targetCartId = sourceCart.id;
					continue;
				}

				const sourceItems = await tx
					.select()
					.from(cartItem)
					.where(eq(cartItem.cartId, sourceCart.id));

				for (const sourceItem of sourceItems) {
					const [existingTargetItem] = await tx
						.select()
						.from(cartItem)
						.where(
							and(eq(cartItem.cartId, targetCartId), eq(cartItem.variantId, sourceItem.variantId))
						)
						.limit(1);

					if (existingTargetItem) {
						await tx
							.update(cartItem)
							.set({
								quantity: Math.min(
									existingTargetItem.quantity + sourceItem.quantity,
									MAX_CART_ITEM_QUANTITY
								)
							})
							.where(eq(cartItem.id, existingTargetItem.id));

						await tx.delete(cartItem).where(eq(cartItem.id, sourceItem.id));
						continue;
					}

					await tx
						.update(cartItem)
						.set({ cartId: targetCartId })
						.where(eq(cartItem.id, sourceItem.id));
				}

				await tx.delete(cart).where(eq(cart.id, sourceCart.id));
			}
		});
	} catch (error) {
		if (isAppError(error)) throw error;

		throw new CartError('Unable to migrate anonymous cart.', ErrorCode.ANONYMOUS_MIGRATION_FAILED, {
			anonymousUserId,
			targetUserId,
			cause: getErrorMessage(error)
		});
	}
}
