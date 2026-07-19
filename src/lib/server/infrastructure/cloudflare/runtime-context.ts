import { AsyncLocalStorage } from 'node:async_hooks';

interface RuntimeContext {
	platformEnv: App.Platform['env'];
	singletons: Map<symbol, unknown>;
}

const runtimeContext = new AsyncLocalStorage<RuntimeContext>();

export function runWithPlatformEnv<T>(platformEnv: App.Platform['env'], task: () => T): T {
	return runtimeContext.run({ platformEnv, singletons: new Map() }, task);
}

export function getPlatformEnv(): App.Platform['env'] {
	const context = runtimeContext.getStore();
	if (!context) {
		throw new Error(
			'Cloudflare runtime context is unavailable. Run server work through runWithPlatformEnv().'
		);
	}

	return context.platformEnv;
}

export function getRuntimeSingleton<T>(key: symbol, create: () => T): T {
	const context = runtimeContext.getStore();
	if (!context) {
		throw new Error(
			'Cloudflare runtime context is unavailable. Run server work through runWithPlatformEnv().'
		);
	}

	if (context.singletons.has(key)) {
		return context.singletons.get(key) as T;
	}

	const value = create();
	context.singletons.set(key, value);
	return value;
}
