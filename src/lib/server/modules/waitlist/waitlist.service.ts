import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export type WaitlistResult =
	| { success: true }
	| { success: false; error: 'DUPLICATE' | 'DB_ERROR' };

export async function addToWaitlist(phone: string): Promise<WaitlistResult> {
	try {
		const existing = await db
			.select({ id: waitlist.id })
			.from(waitlist)
			.where(eq(waitlist.phone, phone))
			.limit(1);

		if (existing.length > 0) {
			return { success: false, error: 'DUPLICATE' };
		}

		await db.insert(waitlist).values({ phone });

		return { success: true };
	} catch (err) {
		console.error('[waitlist] addToWaitlist error:', err);
		return { success: false, error: 'DB_ERROR' };
	}
}
