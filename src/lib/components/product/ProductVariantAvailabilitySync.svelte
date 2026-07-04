<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { StorefrontVariantAvailabilityDTO } from '$lib/server/modules/bag/bag.types';

	type StorefrontVariantAvailabilityResponse = Omit<
		StorefrontVariantAvailabilityDTO,
		'checkoutHoldExpiresAt'
	> & {
		checkoutHoldExpiresAt: string | null;
	};

	let {
		variantId,
		onAvailability
	}: {
		variantId: string;
		onAvailability: (availability: StorefrontVariantAvailabilityDTO) => void;
	} = $props();

	let refreshRequest: Promise<void> | null = null;

	async function refreshAvailability() {
		if (refreshRequest) return refreshRequest;

		refreshRequest = fetch(
			`${resolve('/api/products/availability')}?variantId=${encodeURIComponent(variantId)}`,
			{ cache: 'no-store' }
		)
			.then(async (response) => {
				if (!response.ok) return;

				const rows = (await response.json()) as StorefrontVariantAvailabilityResponse[];
				const responseAvailability = rows.find((row) => row.variantId === variantId);
				if (!responseAvailability) return;

				onAvailability({
					...responseAvailability,
					checkoutHoldExpiresAt: responseAvailability.checkoutHoldExpiresAt
						? new Date(responseAvailability.checkoutHoldExpiresAt)
						: null
				});
			})
			.catch((error) => {
				console.error('[products] Failed to refresh product availability:', error);
			})
			.finally(() => {
				refreshRequest = null;
			});

		return refreshRequest;
	}

	onMount(() => {
		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') {
				void refreshAvailability();
			}
		};
		const availabilityPoll = setInterval(refreshWhenVisible, 3000);

		refreshWhenVisible();
		window.addEventListener('focus', refreshWhenVisible);
		document.addEventListener('visibilitychange', refreshWhenVisible);

		return () => {
			clearInterval(availabilityPoll);
			window.removeEventListener('focus', refreshWhenVisible);
			document.removeEventListener('visibilitychange', refreshWhenVisible);
		};
	});
</script>
