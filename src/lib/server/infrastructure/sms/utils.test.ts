import { describe, expect, it } from 'vitest';
import { normalizeSmsRecipient } from './utils';

describe('SMS recipient normalization', () => {
	it.each(['0771234567', '94771234567', '+94771234567'])(
		'canonicalizes %s to one Sri Lankan E.164 identity',
		(value) => {
			expect(normalizeSmsRecipient(value)).toBe('+94771234567');
		}
	);
});
