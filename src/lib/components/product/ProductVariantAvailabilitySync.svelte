<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { StorefrontVariantAvailabilityDTO } from '$lib/server/modules/bag/bag.types';
	import {
		PRODUCT_REFRESH_INTERVAL_MS,
		RETURN_REFRESH_MIN_FRESH_MS,
		getExpiryRefreshDelay,
		getNextRefreshDelay,
		isRefreshStale
	} from '$lib/client/modules/availability-refresh';

	type StorefrontVariantAvailabilityResponse = Omit<
		StorefrontVariantAvailabilityDTO,
		'checkoutHoldExpiresAt'
	> & {
		checkoutHoldExpiresAt: string | null;
	};

	let {
		variantId,
		availability,
		snapshotSyncedAt,
		onAvailability
	}: {
		variantId: string;
		availability: StorefrontVariantAvailabilityDTO | null;
		snapshotSyncedAt: number;
		onAvailability: (availability: StorefrontVariantAvailabilityDTO) => void;
	} = $props();

	let refreshRequest: Promise<boolean> | null = null;
	let requestController: AbortController | null = null;
	let lastSyncedAt = 0;
	let destroyed = false;

	async function refreshAvailability(): Promise<boolean> {
		if (refreshRequest) return refreshRequest;

		const requestedVariantId = variantId;
		const controller = new AbortController();
		requestController = controller;
		const request = (async () => {
			try {
				const response = await fetch(
					`${resolve('/api/products/availability')}?variantId=${encodeURIComponent(requestedVariantId)}`,
					{ cache: 'no-store', signal: controller.signal }
				);
				if (!response.ok) return false;

				const rows = (await response.json()) as StorefrontVariantAvailabilityResponse[];
				const responseAvailability = rows.find((row) => row.variantId === requestedVariantId);
				if (!responseAvailability || destroyed || requestedVariantId !== variantId) return false;

				onAvailability({
					...responseAvailability,
					checkoutHoldExpiresAt: responseAvailability.checkoutHoldExpiresAt
						? new Date(responseAvailability.checkoutHoldExpiresAt)
						: null
				});
				lastSyncedAt = Date.now();
				return true;
			} catch (error) {
				if (!(error instanceof DOMException && error.name === 'AbortError')) {
					console.error('[products] Failed to refresh product availability:', error);
				}
				return false;
			}
		})();
		refreshRequest = request;

		const succeeded = await request;
		if (refreshRequest === request) refreshRequest = null;
		if (requestController === controller) requestController = null;
		return succeeded;
	}

	$effect(() => {
		const delay = getExpiryRefreshDelay(availability?.checkoutHoldExpiresAt);
		if (delay === null) return;

		const expiryTimer = setTimeout(() => {
			if (document.visibilityState === 'visible') {
				void refreshAvailability();
			}
		}, delay);
		return () => clearTimeout(expiryTimer);
	});

	onMount(() => {
		lastSyncedAt = snapshotSyncedAt;
		let pollTimer: ReturnType<typeof setTimeout> | null = null;
		let returnRefreshRequest: Promise<void> | null = null;
		let failureCount = 0;

		const schedulePoll = () => {
			if (pollTimer) clearTimeout(pollTimer);
			pollTimer = setTimeout(
				async () => {
					if (destroyed) return;
					if (document.visibilityState === 'visible') {
						const succeeded = await refreshAvailability();
						if (destroyed) return;
						failureCount = succeeded ? 0 : failureCount + 1;
					}
					if (destroyed) return;
					schedulePoll();
				},
				getNextRefreshDelay(PRODUCT_REFRESH_INTERVAL_MS, failureCount)
			);
		};

		const refreshAfterReturn = () => {
			if (
				returnRefreshRequest ||
				document.visibilityState !== 'visible' ||
				!isRefreshStale(lastSyncedAt, RETURN_REFRESH_MIN_FRESH_MS)
			) {
				return;
			}

			returnRefreshRequest = (async () => {
				const succeeded = await refreshAvailability();
				if (destroyed) return;
				failureCount = succeeded ? 0 : failureCount + 1;
				schedulePoll();
			})().finally(() => {
				returnRefreshRequest = null;
			});
		};

		schedulePoll();
		refreshAfterReturn();
		window.addEventListener('focus', refreshAfterReturn);
		document.addEventListener('visibilitychange', refreshAfterReturn);
		return () => {
			destroyed = true;
			if (pollTimer) clearTimeout(pollTimer);
			requestController?.abort();
			window.removeEventListener('focus', refreshAfterReturn);
			document.removeEventListener('visibilitychange', refreshAfterReturn);
		};
	});
</script>
