import { collectErrorMessages } from '../foundation/utils';

const TRANSIENT_D1_ERROR_FRAGMENTS = [
	'network connection lost',
	'storage operation exceeded timeout which caused object to be reset',
	'storage caused object to be reset',
	'storage caused object reset',
	'reset because its code was updated',
	'internal error while starting up d1 db storage',
	'internal error in d1 db storage',
	'cannot resolve d1 db due to transient remote node',
	'request stream disconnected',
	'client disconnected'
] as const;

export function isTransientD1Error(error: unknown): boolean {
	const message = collectErrorMessages(error).join(' | ').toLowerCase();
	return TRANSIENT_D1_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment));
}
