import type { SriLankaDistrict } from '../addresses/addresses.drizzle';
import type {
	InsertShippingMethod,
	InsertShippingZone,
	UpdateShippingMethod
} from './shipping.drizzle';

export type { SriLankaDistrict };

export type ShippingDistrictOption = {
	value: SriLankaDistrict;
	label: SriLankaDistrict;
};

export type ShippingMethodDTO = {
	id: string;
	name: string;
	description: string | null;
	carrier: string | null;
	price: number;
	freeShippingThreshold: number | null;
	estimatedDaysMin: number;
	estimatedDaysMax: number;
	etaText: string;
	isActive: boolean;
	sortOrder: number;
	createdAt: Date;
	updatedAt: Date;
	zones?: ShippingZoneDTO[];
};

export type ShippingZoneDTO = {
	id: string;
	shippingMethodId: string;
	district: SriLankaDistrict;
	priceOverride: number;
	estimatedDaysMin: number;
	estimatedDaysMax: number;
	etaText: string;
};

export type ShippingQuoteDTO = {
	shippingMethodId: string;
	name: string;
	description: string | null;
	carrier: string | null;
	district: SriLankaDistrict | null;
	basePrice: number;
	zonePriceOverride: number | null;
	priceBeforeFreeShipping: number;
	price: number;
	freeShippingThreshold: number | null;
	freeShippingThresholdMet: boolean;
	isFreeShipping: boolean;
	amountToFreeShipping: number | null;
	estimatedDaysMin: number;
	estimatedDaysMax: number;
	etaText: string;
	isActive: boolean;
	sortOrder: number;
};

export type ShippingMethodSnapshot = {
	id: string;
	name: string;
	description: string | null;
	carrier: string | null;
	price: number;
	estimatedDaysMin: number;
	estimatedDaysMax: number;
	etaText: string;
};

export type CreateShippingMethodInput = InsertShippingMethod;
export type UpdateShippingMethodInput = UpdateShippingMethod;
export type SetShippingZoneInput = InsertShippingZone;

export type ListShippingQuotesInput = {
	district?: SriLankaDistrict | null;
	subtotal?: number;
};

export type CalculateShippingQuoteInput = {
	shippingMethodId: string;
	district: SriLankaDistrict;
	subtotal: number;
};

export type ListShippingMethodsOptions = {
	isActive?: boolean;
	query?: string | null;
	includeZones?: boolean;
	limit?: number;
	offset?: number;
};

export type ListShippingZonesOptions = {
	shippingMethodId?: string;
	district?: SriLankaDistrict;
	limit?: number;
	offset?: number;
};

export type ShippingMethodListResult = {
	items: ShippingMethodDTO[];
	total: number;
	limit: number;
	offset: number;
};

export type ShippingZoneListResult = {
	items: ShippingZoneDTO[];
	total: number;
	limit: number;
	offset: number;
};
