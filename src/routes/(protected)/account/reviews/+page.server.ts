import { fail } from '@sveltejs/kit';
import { message, superValidate, withFiles } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import {
	addReviewMedia,
	addReviewMediaFormSchema,
	deleteReview,
	deleteReviewFormSchema,
	deleteReviewMedia,
	deleteReviewMediaFormSchema,
	listMyReviews,
	reorderReviewMedia,
	reorderReviewMediaFormSchema,
	updateMyReview,
	updateMyReviewFormSchema
} from '$lib/server/modules/reviews';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import { requireAccountContext } from '../_account.server';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = requireAccountContext(locals, url);

	try {
		const [reviewsResult, updateForm, deleteForm, addMediaForm, deleteMediaForm, reorderForm] =
			await Promise.all([
				listMyReviews(ctx, { limit: 50 }),
				superValidate(zod4(updateMyReviewFormSchema), { id: 'updateReview' }),
				superValidate(zod4(deleteReviewFormSchema), { id: 'deleteReview' }),
				superValidate(zod4(addReviewMediaFormSchema), { id: 'addReviewMedia' }),
				superValidate(zod4(deleteReviewMediaFormSchema), { id: 'deleteReviewMedia' }),
				superValidate(zod4(reorderReviewMediaFormSchema), { id: 'reorderReviewMedia' })
			]);

		return {
			reviewsResult,
			updateForm,
			deleteForm,
			addMediaForm,
			deleteMediaForm,
			reorderForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	update: async ({ locals, request, url }) => {
		const ctx = requireAccountContext(locals, url);
		const form = await superValidate(request, zod4(updateMyReviewFormSchema), {
			id: 'updateReview'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await updateMyReview(ctx, form.data);
			return message(form, 'Review updated and returned to moderation.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	delete: async (event) => {
		const ctx = { ...requireAccountContext(event.locals, event.url), event };
		const form = await superValidate(event.request, zod4(deleteReviewFormSchema), {
			id: 'deleteReview'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteReview(ctx, form.data);
			return message(form, 'Review deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	addMedia: async (event) => {
		const ctx = { ...requireAccountContext(event.locals, event.url), event };
		const form = await superValidate(event.request, zod4(addReviewMediaFormSchema), {
			id: 'addReviewMedia'
		});

		if (!form.valid) return fail(400, withFiles({ form }));

		try {
			await addReviewMedia(ctx, form.data);
			return message(form, 'Review media added.');
		} catch (error) {
			return withFiles(formFailFromAppError(form, error));
		}
	},

	deleteMedia: async (event) => {
		const ctx = { ...requireAccountContext(event.locals, event.url), event };
		const form = await superValidate(event.request, zod4(deleteReviewMediaFormSchema), {
			id: 'deleteReviewMedia'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteReviewMedia(ctx, form.data);
			return message(form, 'Review media removed.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	reorderMedia: async (event) => {
		const ctx = requireAccountContext(event.locals, event.url);
		const form = await superValidate(event.request, zod4(reorderReviewMediaFormSchema), {
			id: 'reorderReviewMedia'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await reorderReviewMedia(ctx, form.data);
			return message(form, 'Review media reordered.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
