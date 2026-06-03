import { fail, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	listDrops,
	deleteDrop,
	transitionDropStatus,
	transitionDropStatusFormSchema
} from '$lib/server/modules/drops';
import { z } from 'zod';
import type { ServiceContext } from '$lib/server/foundation/context';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

const idSchema = z.string().min(1).max(64);

const deleteDropFormSchema = z.object({
	dropId: idSchema
});

function getAdminContext(
	locals: App.Locals,
	platform?: App.Platform,
	event?: Pick<RequestEvent, 'platform'>
): ServiceContext {
	return {
		actor: locals.user,
		event,
		notificationQueue: platform?.env?.NOTIFICATION_QUEUE ?? null
	};
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const query = url.searchParams.get('query')?.trim() || '';
	const statusFilter = url.searchParams.get('status')?.trim() || '';
	const limit = getIntegerParam(url.searchParams.get('limit')) ?? 20;
	const offset = getIntegerParam(url.searchParams.get('offset')) ?? 0;

	try {
		const [deleteDropForm, transitionDropStatusForm] = await Promise.all([
			superValidate(zod4(deleteDropFormSchema), { id: 'deleteDrop' }),
			superValidate(zod4(transitionDropStatusFormSchema), { id: 'transitionDropStatus' })
		]);

		// We load all drops (with limit 250 to allow searching/sorting on loaded subset, similar to categories)
		const dropsPromise = listDrops(ctx, {
			includeArchived: true,
			limit: 250
		}).then((result) => {
			let items = result.items;

			if (statusFilter && statusFilter !== 'all') {
				items = items.filter((d) => d.status === statusFilter);
			}

			if (query) {
				const lower = query.toLowerCase();
				items = items.filter(
					(d) => d.name.toLowerCase().includes(lower) || d.slug.toLowerCase().includes(lower)
				);
			}

			return {
				items: items.slice(offset, offset + limit),
				total: items.length
			};
		});

		// Load all drops for statistics overview
		const allDropsPromise = listDrops(ctx, { includeArchived: true, limit: 250 }).then(
			(r) => r.items
		);

		return {
			streamed: {
				drops: dropsPromise,
				allDrops: allDropsPromise
			},
			limit,
			offset,
			filters: {
				query,
				status: statusFilter || 'all',
				limit,
				offset
			},
			deleteDropForm,
			transitionDropStatusForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	deleteDrop: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(deleteDropFormSchema), {
			id: 'deleteDrop'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteDrop(ctx, { id: form.data.dropId });
			return message(form, 'Drop deleted successfully.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	transitionDropStatus: async (event) => {
		const ctx = getAdminContext(event.locals, event.platform, event);
		const form = await superValidate(event.request, zod4(transitionDropStatusFormSchema), {
			id: 'transitionDropStatus'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const { dropId, toStatus } = form.data;
			await transitionDropStatus(ctx, { dropId, toStatus });
			return message(form, `Drop status transitioned to ${toStatus}.`);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
