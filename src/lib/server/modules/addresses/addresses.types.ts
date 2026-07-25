import type { InsertAddress, SriLankaDistrict, UpdateAddress } from './addresses.drizzle';

export type SriLankaDistrictOption = {
	value: SriLankaDistrict;
	label: SriLankaDistrict;
};

export type AddressDTO = {
	id: string;
	userId: string | null;
	label: string | null;
	recipientName: string;
	phone: string;
	addressLine1: string;
	addressLine2: string | null;
	city: string;
	district: SriLankaDistrict;
	postalCode: string | null;
	isDefault: boolean;
	createdAt: Date;
	updatedAt: Date;
	formattedLines: string[];
	singleLine: string;
};

export type CreateAddressInput = Omit<InsertAddress, 'userId'>;

export type UpdateAddressInput = UpdateAddress;

export type ListMyAddressesOptions = {
	limit?: number;
	offset?: number;
};

export type ListAddressesOptions = {
	userId?: string;
	district?: SriLankaDistrict;
	isDefault?: boolean;
	hasUser?: boolean;
	query?: string | null;
	limit?: number;
	offset?: number;
};

export type AddressListResult = {
	items: AddressDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type CheckoutAddressInput = {
	recipientName: string;
	phone: string;
	addressLine1: string;
	addressLine2?: string | null;
	city: string;
	district: SriLankaDistrict;
	postalCode?: string | null;
};

export type CheckoutAddressDTO = CheckoutAddressInput & {
	addressLine2: string | null;
	postalCode: string | null;
	formattedLines: string[];
	singleLine: string;
};

export type AddressSnapshotInput = CheckoutAddressDTO | AddressDTO;

export type AddressSnapshot = {
	addressId: string | null;
	recipientName: string;
	phone: string;
	addressLine1: string;
	addressLine2: string | null;
	city: string;
	district: SriLankaDistrict;
	postalCode: string | null;
	country: 'Sri Lanka';
};
