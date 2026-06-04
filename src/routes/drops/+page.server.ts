import type { PageServerLoad } from './$types';
import { listDrops } from '$lib/server/modules/drops';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = { actor: locals.user ?? null };

	try {
		const result = await listDrops(ctx, { includeArchived: true });
		return {
			drops: result.items
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
