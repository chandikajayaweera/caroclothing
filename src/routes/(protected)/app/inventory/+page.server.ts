import { fail, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	adjustInventory,
	adjustInventoryFormSchema,
	getInventory,
	getInventorySummary,
	initializeInventory,
	initializeInventoryFormSchema,
	listInventory,
	listInventoryFormSchema,
	restockInventory,
	restockInventoryFormSchema,
	updateInventorySettings,
	updateInventorySettingsFormSchema
} from '$lib/server/modules/inventory';
import type { ServiceContext } from '$lib/server/foundation/context';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

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

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);

	// Extract filters
	const query = url.searchParams.get('query') ?? undefined;
	const stockStatus = url.searchParams.get('stockStatus') ?? undefined;
	const trackInventory = url.searchParams.get('trackInventory') ?? undefined;
	const allowBackorder = url.searchParams.get('allowBackorder') ?? undefined;
	const limit = url.searchParams.get('limit') ?? undefined;
	const offset = url.searchParams.get('offset') ?? undefined;
	const openId = url.searchParams.get('open') ?? undefined;

	const parsed = listInventoryFormSchema.safeParse({
		query,
		stockStatus,
		trackInventory,
		allowBackorder,
		limit,
		offset
	});

	const listOptions = parsed.success ? parsed.data : { limit: 50, offset: 0 };

	try {
		const [summary, inventoryResult, initializeForm, updateSettingsForm, restockForm, adjustForm] =
			await Promise.all([
				getInventorySummary(ctx),
				listInventory(ctx, listOptions),
				superValidate(zod4(initializeInventoryFormSchema), { id: 'initializeInventory' }),
				superValidate(zod4(updateInventorySettingsFormSchema), { id: 'updateInventorySettings' }),
				superValidate(zod4(restockInventoryFormSchema), { id: 'restockInventory' }),
				superValidate(zod4(adjustInventoryFormSchema), { id: 'adjustInventory' })
			]);

		let activeDetail = null;
		if (openId) {
			try {
				activeDetail = await getInventory(ctx, { variantId: openId });
			} catch (e) {
				// Ignore if the variant ID is invalid or doesn't exist
			}
		}

		return {
			summary,
			inventoryResult,
			activeDetail,
			filters: {
				query: listOptions.query ?? '',
				stockStatus: listOptions.stockStatus ?? '',
				trackInventory:
					listOptions.trackInventory === undefined ? '' : String(listOptions.trackInventory),
				allowBackorder:
					listOptions.allowBackorder === undefined ? '' : String(listOptions.allowBackorder),
				limit: listOptions.limit ?? 50,
				offset: listOptions.offset ?? 0
			},
			initializeForm,
			updateSettingsForm,
			restockForm,
			adjustForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	initialize: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(initializeInventoryFormSchema), {
			id: 'initializeInventory'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await initializeInventory(ctx, form.data);
			return message(form, 'Inventory initialized.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	updateSettings: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(updateInventorySettingsFormSchema), {
			id: 'updateInventorySettings'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateInventorySettings(ctx, form.data);
			return message(form, 'Inventory settings updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	restock: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(restockInventoryFormSchema), {
			id: 'restockInventory'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await restockInventory(ctx, form.data);
			return message(form, 'Stock replenished.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	adjust: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(adjustInventoryFormSchema), {
			id: 'adjustInventory'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await adjustInventory(ctx, form.data);
			return message(form, 'Stock level adjusted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
