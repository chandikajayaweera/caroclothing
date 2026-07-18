export const BAG_REFRESH_INTERVAL_MS = 60_000;
export const PRODUCT_REFRESH_INTERVAL_MS = 30_000;
export const RETURN_REFRESH_MIN_FRESH_MS = 10_000;
export const EXPIRY_REFRESH_GRACE_MS = 250;
export const MAX_REFRESH_BACKOFF_MS = 5 * 60_000;

export function isRefreshStale(
	lastSyncedAt: number | null,
	minFreshMs: number,
	now = Date.now()
): boolean {
	return lastSyncedAt === null || now - lastSyncedAt >= minFreshMs;
}

export function shouldApplySnapshot(snapshotVersion: number, currentVersion: number): boolean {
	return snapshotVersion >= currentVersion;
}

export function getExpiryRefreshDelay(
	expiresAt: Date | string | null | undefined,
	now = Date.now()
): number | null {
	if (!expiresAt) return null;

	const expiryTime = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
	if (!Number.isFinite(expiryTime)) return null;
	if (expiryTime <= now) return null;

	return expiryTime - now + EXPIRY_REFRESH_GRACE_MS;
}

export function getNextRefreshDelay(
	baseIntervalMs: number,
	failureCount: number,
	random = Math.random()
): number {
	const backoff = Math.min(
		MAX_REFRESH_BACKOFF_MS,
		baseIntervalMs * 2 ** Math.min(Math.max(0, failureCount), 4)
	);
	const jitter = 0.9 + Math.min(1, Math.max(0, random)) * 0.2;

	return Math.min(MAX_REFRESH_BACKOFF_MS, Math.round(backoff * jitter));
}
