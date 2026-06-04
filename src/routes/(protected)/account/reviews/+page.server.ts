import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { listMyReviews, updateMyReview } from '$lib/server/modules/reviews';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function requireAccountContext(locals: App.Locals, url: URL) {
	if (!locals.user || locals.user.isAnonymous) {
		const redirectTo = `${url.pathname}${url.search}`;
		throw redirect(302, `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	return { actor: locals.user };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = requireAccountContext(locals, url);

	try {
		const reviewsResult = await listMyReviews(ctx, { limit: 50 });
		return { reviewsResult };
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	update: async ({ locals, request, url }) => {
		const ctx = requireAccountContext(locals, url);
		const formData = await request.formData();
		const reviewId = formData.get('reviewId') as string;
		const rating = parseInt(formData.get('rating') as string, 10);
		const body = formData.get('text') as string;

		if (!reviewId || isNaN(rating) || rating < 1 || rating > 5 || !body?.trim()) {
			return fail(400, { error: 'Invalid review fields' });
		}

		try {
			await updateMyReview(ctx, { reviewId, rating, body });
			return { success: true };
		} catch (error) {
			throwHttpFromAppError(error);
		}
	}
};
