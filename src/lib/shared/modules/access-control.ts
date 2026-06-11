import { createAccessControl } from 'better-auth/plugins';

const statements = {
	address: ['create', 'read', 'update', 'delete'],
	bag: ['create', 'read', 'update', 'delete'],
	category: ['create', 'read', 'update', 'delete'],
	drop: ['create', 'read', 'update', 'delete'],
	product: ['create', 'read', 'update', 'delete'],
	productVariant: ['create', 'read', 'update', 'delete'],
	productImage: ['create', 'read', 'update', 'delete'],
	promotion: ['create', 'read', 'update', 'delete'],
	review: ['create', 'read', 'update', 'delete'],
	reviewMedia: ['create', 'read', 'update', 'delete'],
	tag: ['create', 'read', 'update', 'delete'],
	inventory: ['create', 'read', 'update', 'delete'],
	pricing: ['create', 'read', 'update', 'delete'],
	order: ['create', 'read', 'update', 'delete'],
	payment: ['create', 'read', 'update', 'delete'],
	shipping: ['create', 'read', 'update', 'delete'],
	settings: ['create', 'read', 'update', 'delete'],
	user: ['create', 'read', 'update', 'delete'],
	wishlist: ['create', 'read', 'update', 'delete']
} as const;

export const accessControl = createAccessControl(statements);

export const adminUser = accessControl.newRole({
	address: ['create', 'read', 'update', 'delete'],
	bag: ['create', 'read', 'update', 'delete'],
	category: ['create', 'read', 'update', 'delete'],
	drop: ['create', 'read', 'update', 'delete'],
	product: ['create', 'read', 'update', 'delete'],
	productVariant: ['create', 'read', 'update', 'delete'],
	productImage: ['create', 'read', 'update', 'delete'],
	promotion: ['create', 'read', 'update', 'delete'],
	review: ['create', 'read', 'update', 'delete'],
	reviewMedia: ['create', 'read', 'update', 'delete'],
	tag: ['create', 'read', 'update', 'delete'],
	inventory: ['create', 'read', 'update', 'delete'],
	pricing: ['create', 'read', 'update', 'delete'],
	order: ['create', 'read', 'update', 'delete'],
	payment: ['create', 'read', 'update', 'delete'],
	shipping: ['create', 'read', 'update', 'delete'],
	settings: ['create', 'read', 'update', 'delete'],
	user: ['create', 'read', 'update', 'delete'],
	wishlist: ['create', 'read', 'update', 'delete']
});

export const customerUser = accessControl.newRole({
	address: ['create', 'read', 'update', 'delete'],
	bag: ['create', 'read', 'update', 'delete'],
	category: ['read'],
	drop: ['read'],
	product: ['read'],
	productVariant: ['read'],
	productImage: ['read'],
	promotion: ['read'],
	review: ['create', 'read', 'update', 'delete'],
	reviewMedia: ['create', 'read', 'update', 'delete'],
	tag: ['read'],
	order: ['create', 'read'],
	payment: ['create', 'read'],
	shipping: ['read'],
	settings: ['read'],
	user: ['read'],
	wishlist: ['create', 'read', 'update', 'delete']
});

export const userRoles = {
	adminUser,
	customerUser
} as const;

export const userRoleIds = ['adminUser', 'customerUser'] as const;
export type UserRole = (typeof userRoleIds)[number];
