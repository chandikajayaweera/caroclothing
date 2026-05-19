import type { PageServerLoad } from './$types';
import { getProduct } from '$lib/server/modules/products';
import type { ServiceContext } from '$lib/server/foundation/context';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function getStorefrontContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user ?? null };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = getStorefrontContext(locals);

	try {
		const product = await getProduct(ctx, { slug: params.slug });

		return {
			product
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
