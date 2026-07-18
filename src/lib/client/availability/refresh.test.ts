import { describe, expect, it } from 'vitest';
import {
	BAG_REFRESH_INTERVAL_MS,
	EXPIRY_REFRESH_GRACE_MS,
	PRODUCT_REFRESH_INTERVAL_MS,
	getExpiryRefreshDelay,
	getNextRefreshDelay,
	isRefreshStale,
	shouldApplySnapshot
} from './refresh';

describe('availability refresh policy', () => {
	it('uses bounded bag and product refresh cadences', () => {
		expect(BAG_REFRESH_INTERVAL_MS).toBe(60_000);
		expect(PRODUCT_REFRESH_INTERVAL_MS).toBe(30_000);
	});

	it('refreshes only after the freshness threshold', () => {
		expect(isRefreshStale(null, 10_000, 20_000)).toBe(true);
		expect(isRefreshStale(10_001, 10_000, 20_000)).toBe(false);
		expect(isRefreshStale(10_000, 10_000, 20_000)).toBe(true);
	});

	it('refreshes immediately after a checkout hold expires', () => {
		const now = Date.parse('2026-07-13T10:00:00.000Z');
		expect(getExpiryRefreshDelay('2026-07-13T10:00:12.000Z', now)).toBe(
			12_000 + EXPIRY_REFRESH_GRACE_MS
		);
		expect(getExpiryRefreshDelay('2026-07-13T09:59:59.000Z', now)).toBeNull();
		expect(getExpiryRefreshDelay('2026-07-13T10:00:00.000Z', now)).toBeNull();
		expect(getExpiryRefreshDelay(null, now)).toBeNull();
	});

	it('rejects a read snapshot made before a newer mutation', () => {
		expect(shouldApplySnapshot(4, 4)).toBe(true);
		expect(shouldApplySnapshot(4, 5)).toBe(false);
	});

	it('adds deterministic jitter and bounded failure backoff', () => {
		expect(getNextRefreshDelay(30_000, 0, 0.5)).toBe(30_000);
		expect(getNextRefreshDelay(30_000, 1, 0.5)).toBe(60_000);
		expect(getNextRefreshDelay(30_000, 10, 0.5)).toBe(300_000);
		expect(getNextRefreshDelay(30_000, 10, 1)).toBe(300_000);
	});
});
