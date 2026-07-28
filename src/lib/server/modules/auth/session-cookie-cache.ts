export function shouldDisableSessionCookieCache(event: {
	request: Pick<Request, 'method'>;
	url: Pick<URL, 'pathname'>;
}): boolean {
	const { method } = event.request;
	const { pathname } = event.url;

	return (
		(method !== 'GET' && method !== 'HEAD') ||
		pathname === '/app' ||
		pathname.startsWith('/app/') ||
		pathname === '/account/security' ||
		pathname.startsWith('/account/security/') ||
		pathname === '/api/auth' ||
		pathname.startsWith('/api/auth/')
	);
}
