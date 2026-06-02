import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	getDrop,
	deleteDrop,
	transitionDropStatus,
	transitionDropStatusFormSchema,
	listDropWaitlistEntries
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

export const load: PageServerLoad = async ({ locals, params, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const waitlistLimit = getIntegerParam(url.searchParams.get('limit')) ?? 50;
	const waitlistOffset = getIntegerParam(url.searchParams.get('offset')) ?? 0;

	try {
		const drop = await getDrop(ctx, { slug: params.dropslug }, { includeArchived: true });

		const deleteDropForm = await superValidate(zod4(deleteDropFormSchema), {
			id: 'deleteDrop'
		});
		const transitionDropStatusForm = await superValidate(zod4(transitionDropStatusFormSchema), {
			id: 'transitionDropStatus'
		});

		const waitlistPromise = listDropWaitlistEntries(ctx, {
			dropId: drop.id,
			limit: waitlistLimit,
			offset: waitlistOffset
		});

		return {
			drop,
			deleteDropForm,
			transitionDropStatusForm,
			waitlistLimit,
			waitlistOffset,
			streamed: {
				waitlist: waitlistPromise
			}
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
		} catch (error) {
			return formFailFromAppError(form, error);
		}

		throw redirect(303, '/app/drops');
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
			return { success: true, message: `Drop transitioned to ${toStatus}` };
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
