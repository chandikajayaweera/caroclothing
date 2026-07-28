import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { withTransientD1ReadRetry } from '$lib/server/db/retry';
import type { ServiceContext } from '$lib/server/foundation/context';
import { requireActor } from '$lib/server/foundation/guards';
import { address } from '../addresses/addresses.drizzle';
import { order } from '../orders/orders.drizzle';
import { review } from '../reviews/reviews.drizzle';
import { wishlistItem } from '../wishlist/wishlist.drizzle';
import type { AccountSummaryDTO } from './account.types';

export async function getMyAccountSummary(ctx: ServiceContext): Promise<AccountSummaryDTO> {
	const actor = requireActor(ctx.actor);
	const [row] = await withTransientD1ReadRetry(() =>
		getDb()
			.select({
				orders:
					sql<number>`(select count(*) from ${order} where ${order.userId} = ${actor.id})`.mapWith(
						Number
					),
				addresses:
					sql<number>`(select count(*) from ${address} where ${address.userId} = ${actor.id})`.mapWith(
						Number
					),
				wishlist:
					sql<number>`(select count(*) from ${wishlistItem} where ${wishlistItem.userId} = ${actor.id})`.mapWith(
						Number
					),
				reviews:
					sql<number>`(select count(*) from ${review} where ${review.userId} = ${actor.id})`.mapWith(
						Number
					)
			})
			.from(sql`(select 1)`)
	);

	return {
		orders: row?.orders ?? 0,
		addresses: row?.addresses ?? 0,
		wishlist: row?.wishlist ?? 0,
		reviews: row?.reviews ?? 0
	};
}
