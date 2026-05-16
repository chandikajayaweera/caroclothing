import { fail, type RequestEvent } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	addReviewMedia,
	addReviewMediaFormSchema,
	deleteReview,
	deleteReviewFormSchema,
	deleteReviewMedia,
	deleteReviewMediaFormSchema,
	getReviewModerationSummary,
	listPendingReviews,
	listReviews,
	listReviewsFormSchema,
	moderateReview,
	moderateReviewFormSchema,
	reorderReviewMedia,
	reorderReviewMediaFormSchema,
	type ListReviewsInput
} from '$lib/server/modules/reviews';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

function getAdminContext(locals: App.Locals, event?: Pick<RequestEvent, 'platform'>) {
	return { actor: locals.user, event };
}

function getReviewOptions(url: URL): ListReviewsInput {
	const result = listReviewsFormSchema.safeParse({
		productId: getTrimmedParam(url.searchParams.get('productId')),
		userId: getTrimmedParam(url.searchParams.get('userId')),
		orderId: getTrimmedParam(url.searchParams.get('orderId')),
		isApproved: getApprovalFilter(url.searchParams.get('status')),
		isVerifiedPurchase: getVerifiedFilter(url.searchParams.get('verified')),
		rating: getIntegerParam(url.searchParams.get('rating')),
		query: getTrimmedParam(url.searchParams.get('query')),
		limit: getIntegerParam(url.searchParams.get('limit')),
		offset: getIntegerParam(url.searchParams.get('offset'))
	});

	return result.success ? result.data : {};
}

function getTrimmedParam(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function getApprovalFilter(value: string | null): boolean | undefined {
	if (value === 'approved') return true;
	if (value === 'pending') return false;
	return undefined;
}

function getVerifiedFilter(value: string | null): boolean | undefined {
	if (value === 'verified') return true;
	if (value === 'unverified') return false;
	return undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getAdminContext(locals);
	const reviewOptions = getReviewOptions(url);

	try {
		const [
			reviews,
			pendingReviews,
			summary,
			moderateReviewForm,
			deleteReviewForm,
			addReviewMediaForm,
			deleteReviewMediaForm,
			reorderReviewMediaForm
		] = await Promise.all([
			listReviews(ctx, reviewOptions),
			listPendingReviews(ctx, { limit: 8 }),
			getReviewModerationSummary(ctx, {
				productId: reviewOptions.productId
			}),
			superValidate(zod4(moderateReviewFormSchema), {
				id: 'moderateReview'
			}),
			superValidate(zod4(deleteReviewFormSchema), {
				id: 'deleteReview'
			}),
			superValidate(zod4(addReviewMediaFormSchema), {
				id: 'addReviewMedia'
			}),
			superValidate(zod4(deleteReviewMediaFormSchema), {
				id: 'deleteReviewMedia'
			}),
			superValidate(zod4(reorderReviewMediaFormSchema), {
				id: 'reorderReviewMedia'
			})
		]);

		return {
			reviews,
			pendingReviews,
			summary,
			filters: {
				status: url.searchParams.get('status') ?? '',
				verified: url.searchParams.get('verified') ?? '',
				rating: url.searchParams.get('rating') ?? '',
				query: url.searchParams.get('query')?.trim() ?? '',
				productId: url.searchParams.get('productId')?.trim() ?? '',
				userId: url.searchParams.get('userId')?.trim() ?? '',
				orderId: url.searchParams.get('orderId')?.trim() ?? '',
				limit: reviews.limit,
				offset: reviews.offset
			},
			moderateReviewForm,
			deleteReviewForm,
			addReviewMediaForm,
			deleteReviewMediaForm,
			reorderReviewMediaForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	moderate: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(moderateReviewFormSchema), {
			id: 'moderateReview'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await moderateReview(ctx, form.data);
			return message(form, form.data.isApproved ? 'Review approved.' : 'Review moved to pending.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	deleteReview: async (event) => {
		const ctx = getAdminContext(event.locals, event);
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
		const ctx = getAdminContext(event.locals, event);
		const form = await superValidate(event.request, zod4(addReviewMediaFormSchema), {
			id: 'addReviewMedia'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await addReviewMedia(ctx, form.data);
			return message(form, 'Review media added.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	deleteMedia: async (event) => {
		const ctx = getAdminContext(event.locals, event);
		const form = await superValidate(event.request, zod4(deleteReviewMediaFormSchema), {
			id: 'deleteReviewMedia'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await deleteReviewMedia(ctx, form.data);
			return message(form, 'Review media deleted.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	reorderMedia: async (event) => {
		const ctx = getAdminContext(event.locals, event);
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
