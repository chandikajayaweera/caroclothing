import { createAccessControl } from 'better-auth/plugins';

const statements = {
	product: ['create', 'read', 'update', 'delete'],
	inventory: ['create', 'read', 'update', 'delete'],
	pricing: ['create', 'read', 'update', 'delete'],
	order: ['create', 'read', 'update', 'delete'],
	settings: ['create', 'read', 'update', 'delete'],
	user: ['create', 'read', 'update', 'delete']
} as const;

export const accessControl = createAccessControl(statements);

export const adminUser = accessControl.newRole({
	product: ['create', 'read', 'update', 'delete'],
	inventory: ['create', 'read', 'update', 'delete'],
	pricing: ['create', 'read', 'update', 'delete'],
	order: ['create', 'read', 'update', 'delete'],
	settings: ['create', 'read', 'update', 'delete'],
	user: ['create', 'read', 'update', 'delete']
});

export const customerUser = accessControl.newRole({
	product: ['read'],
	order: ['create', 'read'],
	settings: ['read'],
	user: ['read']
});

export const userRoles = {
	adminUser,
	customerUser
} as const;

export const userRoleIds = ['adminUser', 'customerUser'] as const;
export type UserRole = (typeof userRoleIds)[number];
