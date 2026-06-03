import { fail } from '@sveltejs/kit';
import { zod4 } from 'sveltekit-superforms/adapters';
import { message, superValidate } from 'sveltekit-superforms/server';
import type { Actions, PageServerLoad } from './$types';
import {
	listUsers,
	getUserAdminProfile,
	listUserSessions,
	setUserRole,
	banUser,
	unbanUser,
	revokeUserSessions,
	repairUserTempEmailFromLinkedGoogle,
	setUserRoleFormSchema,
	banUserFormSchema,
	unbanUserFormSchema,
	revokeUserSessionsFormSchema,
	repairUserEmailFormSchema,
	type ListUsersOptions
} from '$lib/server/modules/auth';
import {
	formFailFromAppError,
	throwHttpFromAppError
} from '$lib/server/infrastructure/errors/route-adapter';
import type { ServiceContext } from '$lib/server/foundation/context';
import type { UserRole } from '$lib/shared/modules/access-control';

function getAdminContext(locals: App.Locals): ServiceContext {
	return { actor: locals.user };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = getAdminContext(locals);

	const query = url.searchParams.get('query')?.trim() || null;
	const role = url.searchParams.get('role') as UserRole | null;
	const bannedStr = url.searchParams.get('banned');
	const banned = bannedStr === 'true' ? true : bannedStr === 'false' ? false : null;
	const provider = url.searchParams.get('provider') || null;

	const createdAfterStr = url.searchParams.get('createdAfter');
	const createdAfter = createdAfterStr ? new Date(createdAfterStr) : null;
	const createdBeforeStr = url.searchParams.get('createdBefore');
	const createdBefore = createdBeforeStr ? new Date(createdBeforeStr) : null;

	const limit = Number(url.searchParams.get('limit')) || 25;
	const offset = Number(url.searchParams.get('offset')) || 0;

	const options: ListUsersOptions = {
		query,
		role,
		banned,
		provider,
		createdAfter: createdAfter && !Number.isNaN(createdAfter.getTime()) ? createdAfter : null,
		createdBefore: createdBefore && !Number.isNaN(createdBefore.getTime()) ? createdBefore : null,
		limit,
		offset
	};

	const selectedUserId = url.searchParams.get('userId')?.trim() || null;

	try {
		const [
			users,
			setUserRoleForm,
			banUserForm,
			unbanUserForm,
			revokeSessionsForm,
			repairEmailForm
		] = await Promise.all([
			listUsers(ctx, options),
			superValidate(zod4(setUserRoleFormSchema), { id: 'setUserRole' }),
			superValidate(zod4(banUserFormSchema), { id: 'banUser' }),
			superValidate(zod4(unbanUserFormSchema), { id: 'unbanUser' }),
			superValidate(zod4(revokeUserSessionsFormSchema), { id: 'revokeUserSessions' }),
			superValidate(zod4(repairUserEmailFormSchema), { id: 'repairUserEmail' })
		]);

		let selectedUser = null;
		let selectedUserSessions = null;

		if (selectedUserId) {
			try {
				const [profile, sessions] = await Promise.all([
					getUserAdminProfile(ctx, { userId: selectedUserId }),
					listUserSessions(ctx, { userId: selectedUserId })
				]);
				selectedUser = profile;
				selectedUserSessions = sessions.items;
			} catch (error) {
				console.error(`Failed to load selected user ${selectedUserId}:`, error);
			}
		}

		return {
			users,
			selectedUser,
			selectedUserSessions,
			districts: [], // compatibility
			filters: {
				query: query || '',
				role: role || '',
				banned: bannedStr || '',
				provider: provider || '',
				createdAfter: createdAfterStr || '',
				createdBefore: createdBeforeStr || ''
			},
			setUserRoleForm,
			banUserForm,
			unbanUserForm,
			revokeSessionsForm,
			repairEmailForm
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};

export const actions: Actions = {
	setRole: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(setUserRoleFormSchema), { id: 'setUserRole' });

		if (!form.valid) return fail(400, { form });

		try {
			await setUserRole(ctx, form.data);
			return message(form, 'User role updated.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	ban: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(banUserFormSchema), { id: 'banUser' });

		if (!form.valid) return fail(400, { form });

		const expiresAt = form.data.expiresAt ? new Date(form.data.expiresAt) : null;

		try {
			await banUser(ctx, {
				userId: form.data.userId,
				reason: form.data.reason,
				expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
				revokeSessions: form.data.revokeSessions
			});
			return message(form, 'User account suspended.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	unban: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(unbanUserFormSchema), { id: 'unbanUser' });

		if (!form.valid) return fail(400, { form });

		try {
			await unbanUser(ctx, { userId: form.data.userId });
			return message(form, 'User account unsuspended.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	revokeSessions: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(revokeUserSessionsFormSchema), {
			id: 'revokeUserSessions'
		});

		if (!form.valid) return fail(400, { form });

		try {
			const result = await revokeUserSessions(ctx, form.data);
			return message(form, `Successfully revoked ${result.revokedCount} session(s).`);
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	},

	repairEmail: async ({ locals, request }) => {
		const ctx = getAdminContext(locals);
		const form = await superValidate(request, zod4(repairUserEmailFormSchema), {
			id: 'repairUserEmail'
		});

		if (!form.valid) return fail(400, { form });

		try {
			await repairUserTempEmailFromLinkedGoogle(ctx, { userId: form.data.userId });
			return message(form, 'Temporary email address repaired from linked Google account.');
		} catch (error) {
			return formFailFromAppError(form, error);
		}
	}
};
