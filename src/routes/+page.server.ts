import type { PageServerLoad } from './$types';
import { getHomePage } from '$lib/server/modules/storefront';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

export const load: PageServerLoad = async ({ locals }) => {
	const actor = locals.user
		? { id: locals.user.id, role: locals.user.role, isAnonymous: locals.user.isAnonymous }
		: null;

	try {
		return await getHomePage({ actor });
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
