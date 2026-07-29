import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	deleteExpiredGuestBags,
	deleteExpiredGuestBagsFormSchema,
	listBags,
	deleteBag,
	getBagSummary,
	type BagOwnerType,
	type ListBagsOptions
} from '$lib/server/modules/bag';
import {
	failFromAppError,
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';

function getAdminContext(locals: App.Locals) {
	return { actor: locals.user };
}

function getListOptions(url: URL): ListBagsOptions {
	const ownerType = getOwnerType(url.searchParams.get('ownerType'));
	const userId = url.searchParams.get('userId')?.trim() || undefined;
	const limit = getIntegerParam(url.searchParams.get('limit'));
	const offset = getIntegerParam(url.searchParams.get('offset'));

	const statusVal = url.searchParams.get('status');
	const status =
		statusVal === 'active' ||
		statusVal === 'expired' ||
		statusVal === 'empty' ||
		statusVal === 'non-empty' ||
		statusVal === 'all'
			? statusVal
			: undefined;

	return {
		ownerType,
		userId,
		limit,
		offset,
		status,
		includeExpired:
			url.searchParams.get('includeExpired') === 'true' ||
			url.searchParams.get('includeInactive') === 'true'
	};
}

function getOwnerType(value: string | null): BagOwnerType | undefined {
	if (value === 'user' || value === 'guest') return value;
	return undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	const ctx = getAdminContext(locals);
	depends('app:bags');

	try {
		const [bags, summary, cleanupForm] = await Promise.all([
			listBags(ctx, getListOptions(url)),
			getBagSummary(ctx),
			superValidate(zod4(deleteExpiredGuestBagsFormSchema), {
				id: 'deleteExpiredGuestBags'
			})
		]);

		return {
			bags,
			summary,
			filters: {
				ownerType: getOwnerType(url.searchParams.get('ownerType')) ?? '',
				userId: url.searchParams.get('userId')?.trim() ?? '',
				status: url.searchParams.get('status') ?? '',
				includeExpired:
					url.searchParams.get('includeExpired') === 'true' ||
					url.searchParams.get('includeInactive') === 'true',
				limit: getIntegerParam(url.searchParams.get('limit')) ?? bags.limit,
				offset: getIntegerParam(url.searchParams.get('offset')) ?? bags.offset
			},
			cleanupForm,
			refreshedAt: new Date()
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	deleteExpired: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(deleteExpiredGuestBagsFormSchema), {
			id: 'deleteExpiredGuestBags'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const result = await deleteExpiredGuestBags(ctx, { limit: form.data.limit });
			return message(
				form,
				`Deleted ${result.deletedCount} expired bags containing ${result.itemCount} saved items.`
			);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},
	delete: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const data = await request.formData();
		const bagId = data.get('bagId') as string;

		if (!bagId) {
			return fail(400, { message: 'Bag ID is required.' });
		}

		try {
			const result = await deleteBag(ctx, { bagId });
			return {
				success: true,
				message: `Deleted bag and ${result.itemCount} saved ${result.itemCount === 1 ? 'item' : 'items'}.`
			};
		} catch (error) {
			return failFromAppError(error);
		}
	}
};
