import {
	Home,
	ClipboardList,
	CreditCard,
	BadgePercent,
	Package,
	Boxes,
	Truck,
	UsersRound,
	MapPinned,
	Star,
	MessageSquareText,
	Mail,
	Archive,
	PanelsTopLeft
} from 'lucide-svelte';

export type NavHref =
	| '/app'
	| '/app/addresses'
	| '/app/bag'
	| '/app/categories'
	| '/app/inventory'
	| '/app/notifications'
	| '/app/orders'
	| '/app/payments'
	| '/app/products'
	| '/app/promotions'
	| '/app/reviews'
	| '/app/shipping'
	| '/app/storefront'
	| '/app/users'
	| '/app/wishlist';

export type NavItem = {
	label: string;
	href: NavHref;
	icon: typeof Home;
};

export const navGroups: { label: string; items: NavItem[] }[] = [
	{
		label: 'Dashboard',
		items: [{ label: 'Overview', href: '/app', icon: Home }]
	},
	{
		label: 'Commerce',
		items: [
			{ label: 'Orders', href: '/app/orders', icon: ClipboardList },
			{ label: 'Payments', href: '/app/payments', icon: CreditCard },
			{ label: 'Promotions', href: '/app/promotions', icon: BadgePercent }
		]
	},
	{
		label: 'Catalog',
		items: [
			{ label: 'Storefront', href: '/app/storefront', icon: PanelsTopLeft },
			{ label: 'Products', href: '/app/products', icon: Package },
			{ label: 'Categories', href: '/app/categories', icon: Boxes }
		]
	},
	{
		label: 'Operations',
		items: [
			{ label: 'Inventory', href: '/app/inventory', icon: Boxes },
			{ label: 'Shipping', href: '/app/shipping', icon: Truck }
		]
	},
	{
		label: 'Customers',
		items: [
			{ label: 'Users', href: '/app/users', icon: UsersRound },
			{ label: 'Addresses', href: '/app/addresses', icon: MapPinned },
			{ label: 'Reviews', href: '/app/reviews', icon: Star },
			{ label: 'Wishlist', href: '/app/wishlist', icon: MessageSquareText }
		]
	},
	{
		label: 'Services',
		items: [
			{ label: 'Notifications', href: '/app/notifications', icon: Mail },
			{ label: 'Bag', href: '/app/bag', icon: Archive }
		]
	}
];
