import { type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProduct } from '$lib/server/modules/products';
import type { ServiceContext } from '$lib/server/foundation/context';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function getAdminContext(
	locals: App.Locals,
	platform?: App.Platform,
	event?: Pick<RequestEvent, 'platform'>
): ServiceContext {
	return {
		actor: locals.user,
		event,
		notificationWakeups: createCloudflareNotificationWakeups(platform)
	};
}

export const load: PageServerLoad = async ({ locals, params, platform }) => {
	const ctx = getAdminContext(locals, platform);

	try {
		const product = await getProduct(ctx, { slug: params.productslug }, { includeInactive: true });

		return { product };
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
