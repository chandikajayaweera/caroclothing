import { z } from 'zod';
import { userRoleIds } from '$lib/shared/auth/access-control';
import {
	MAX_DISPLAY_NAME_LENGTH,
	MIN_DISPLAY_NAME_LENGTH,
	isValidDisplayName
} from '$lib/shared/auth/profile';

export const updateMyDisplayNameFormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(MIN_DISPLAY_NAME_LENGTH, {
			message: `Name must be at least ${MIN_DISPLAY_NAME_LENGTH} characters`
		})
		.max(MAX_DISPLAY_NAME_LENGTH, {
			message: `Name cannot exceed ${MAX_DISPLAY_NAME_LENGTH} characters`
		})
		.refine(isValidDisplayName, {
			message: 'Enter your name, not a phone number'
		})
});

export const revokeMySessionFormSchema = z.object({
	sessionId: z.string().min(1, { message: 'Session ID is required' })
});

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
