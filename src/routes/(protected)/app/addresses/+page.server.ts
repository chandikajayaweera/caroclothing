import { type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	listAddresses,
	listSriLankaDistrictOptions,
	SRI_LANKA_DISTRICTS,
	type ListAddressesOptions,
	type SriLankaDistrict
} from '$lib/server/modules/addresses';
import type { ServiceContext } from '$lib/server/foundation/context';
import { createCloudflareNotificationWakeups } from '$lib/server/infrastructure/cloudflare';
import { throwHttpFromAppError } from '$lib/server/infrastructure/errors/route-adapter';

function getAdminContext(
	locals: App.Locals,
	platform?: App.Platform,
	event?: Pick<RequestEvent, 'platform'>
): ServiceContext {
	return {
		actor: locals.user,
		event,
		notificationWakeups: createCloudflareNotificationWakeups(platform)
	};
}

function getTrimmedParam(value: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function getBooleanParam(value: string | null): boolean | undefined {
	if (value === 'true') return true;
	if (value === 'false') return false;
	return undefined;
}

function getIntegerParam(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function getDistrictParam(value: string | null): SriLankaDistrict | undefined {
	if (!value) return undefined;
	const district = value.trim();
	if (SRI_LANKA_DISTRICTS.includes(district as SriLankaDistrict)) {
		return district as SriLankaDistrict;
	}
	return undefined;
}

function getListOptions(url: URL): ListAddressesOptions {
	return {
		userId: getTrimmedParam(url.searchParams.get('userId')),
		district: getDistrictParam(url.searchParams.get('district')),
		isDefault: getBooleanParam(url.searchParams.get('isDefault')),
		hasUser: getBooleanParam(url.searchParams.get('hasUser')),
		query: getTrimmedParam(url.searchParams.get('query')),
		limit: getIntegerParam(url.searchParams.get('limit')),
		offset: getIntegerParam(url.searchParams.get('offset'))
	};
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const ctx = getAdminContext(locals, platform);
	const addressOptions = getListOptions(url);

	try {
		return {
			addresses: await listAddresses(ctx, addressOptions),
			districtOptions: listSriLankaDistrictOptions(),
			filters: {
				userId: addressOptions.userId ?? '',
				district: addressOptions.district ?? '',
				isDefault: addressOptions.isDefault === undefined ? '' : String(addressOptions.isDefault),
				hasUser: addressOptions.hasUser === undefined ? '' : String(addressOptions.hasUser),
				query: addressOptions.query ?? '',
				limit: addressOptions.limit ?? 20,
				offset: addressOptions.offset ?? 0
			}
		};
	} catch (error) {
		throwHttpFromAppError(error);
	}
};
