export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent';

type InventoryStatusItem = {
	hasInventory?: boolean;
	inventory?: {
		trackInventory: boolean;
		availableQuantity: number;
		isLowStock: boolean;
	} | null;
};

export function orderStatusVariant(status: string): BadgeVariant {
	switch (status) {
		case 'confirmed':
			return 'accent';
		case 'processing':
			return 'warning';
		case 'shipped':
			return 'info';
		case 'delivered':
		case 'captured':
		case 'authorized':
			return 'success';
		case 'cancelled':
		case 'refunded':
		case 'failed':
			return 'danger';
		default:
			return 'neutral';
	}
}

export function paymentStatusVariant(status: string): BadgeVariant {
	switch (status) {
		case 'captured':
		case 'authorized':
			return 'success';
		case 'failed':
		case 'refunded':
			return 'danger';
		case 'pending':
		case 'partially_refunded':
			return 'warning';
		default:
			return 'neutral';
	}
}

export function inventoryStatusVariant(itemOrQty: number | InventoryStatusItem): BadgeVariant {
	if (typeof itemOrQty === 'number') {
		if (itemOrQty <= 0) return 'danger';
		if (itemOrQty <= 5) return 'warning';
		return 'success';
	}

	if (!itemOrQty || !itemOrQty.hasInventory) return 'neutral';
	if (!itemOrQty.inventory?.trackInventory) return 'neutral';
	if (itemOrQty.inventory.availableQuantity <= 0) return 'danger';
	if (itemOrQty.inventory.isLowStock) return 'warning';
	return 'success';
}

export function booleanStatusVariant(active: boolean): BadgeVariant {
	return active ? 'success' : 'danger';
}

export function promotionStatusVariant(status: string): BadgeVariant {
	switch (status) {
		case 'active':
			return 'success';
		case 'scheduled':
			return 'info';
		case 'expired':
		case 'exhausted':
			return 'danger';
		default:
			return 'neutral';
	}
}

export function notificationStatusVariant(status: string): BadgeVariant {
	switch (status) {
		case 'sent':
			return 'success';
		case 'failed':
			return 'danger';
		case 'processing':
			return 'info';
		case 'pending':
			return 'warning';
		default:
			return 'neutral';
	}
}

export function bagItemAvailabilityVariant(status: string): BadgeVariant {
	switch (status) {
		case 'available':
			return 'success';
		case 'backorder':
			return 'warning';
		case 'unavailable':
			return 'danger';
		default:
			return 'neutral';
	}
}

export function wishlistAlertVariant(status: string): BadgeVariant {
	switch (status) {
		case 'high':
			return 'danger';
		case 'watch':
			return 'warning';
		default:
			return 'neutral';
	}
}

export function formatStatusLabel(value: string | null | undefined): string {
	if (!value) return '—';
	return value.replace(/_/g, ' ');
}
