const routeLabels: Record<string, string> = {
	'/': 'home',
	'/about': 'about Caro',
	'/bag': 'bag',
	'/checkout': 'checkout',
	'/shop': 'shop',
	'/sign-in': 'sign in'
};

const sectionLabels: Record<string, string> = {
	addresses: 'addresses',
	bag: 'bags',
	categories: 'categories',
	inventory: 'inventory',
	notifications: 'notifications',
	orders: 'orders',
	payments: 'payments',
	products: 'products',
	promotions: 'promotions',
	reviews: 'reviews',
	security: 'security',
	shipping: 'shipping',
	storefront: 'storefront',
	users: 'customers',
	wishlist: 'wishlist'
};

export function getNavigationLabel(pathname: string): string {
	const exactLabel = routeLabels[pathname];
	if (exactLabel) return exactLabel;

	const segments = pathname.split('/').filter(Boolean);
	if (segments[0] === 'shop') return 'product';
	if (segments[0] === 'auth') return 'authentication';
	if (segments[0] === 'checkout') {
		return segments[1] === 'confirmation' ? 'order confirmation' : 'payment status';
	}
	if (segments[0] === 'account') {
		return sectionLabels[segments[1] ?? ''] ?? 'account';
	}
	if (segments[0] === 'app') {
		return sectionLabels[segments[1] ?? ''] ?? 'admin dashboard';
	}

	return 'next page';
}

export function isDataNavigation(from: URL | null, to: URL | null, willUnload: boolean): boolean {
	if (!from || !to || willUnload) return false;
	return from.pathname !== to.pathname || from.search !== to.search;
}
