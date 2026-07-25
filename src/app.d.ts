import type { User, Session } from 'better-auth/minimal';
import type { NotificationQueueMessage } from './lib/server/modules/notifications/outbox/outbox.types';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

/*
 * R2Bucket is not imported here. Wrangler generates Cloudflare runtime types in
 * src/worker-configuration.d.ts, and tsconfig.json loads that file globally.
 * Keeping these types ambient avoids duplicate Cloudflare type identities.
 */

type PlatformEnv = Cloudflare.Env & {
	MEDIA: R2Bucket;
	OTP_COOLDOWNS: KVNamespace;
	NOTIFICATION_QUEUE: Queue<NotificationQueueMessage>;
};

declare global {
	const __APP_VERSION__: string;

	namespace App {
		interface Platform {
			env: PlatformEnv;
			cf: CfProperties;
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}

		interface Locals {
			user?: User;
			session?: Session;
		}

		interface Error {
			message: string;
			sentryEventId?: string;
		}

		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
