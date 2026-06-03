import { z } from 'zod';
import { userRoleIds } from '$lib/shared/modules/access-control';

export const setUserRoleFormSchema = z.object({
	userId: z.string().min(1, { message: 'User ID is required' }),
	role: z.enum(userRoleIds, { message: 'Invalid user role' })
});

export const banUserFormSchema = z.object({
	userId: z.string().min(1, { message: 'User ID is required' }),
	reason: z
		.string()
		.max(500, { message: 'Reason cannot exceed 500 characters' })
		.optional()
		.nullable(),
	expiresAt: z.string().optional().nullable(), // ISO string from frontend, transform/parse to Date in server action
	revokeSessions: z.boolean().default(true)
});

export const unbanUserFormSchema = z.object({
	userId: z.string().min(1, { message: 'User ID is required' })
});

export const revokeUserSessionsFormSchema = z.object({
	userId: z.string().min(1, { message: 'User ID is required' }),
	sessionIds: z.string().array().optional() // Empty / omitted means revoke all sessions
});

export const repairUserEmailFormSchema = z.object({
	userId: z.string().min(1, { message: 'User ID is required' })
});
