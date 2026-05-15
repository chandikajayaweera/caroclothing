import type { User, Session } from 'better-auth/minimal';
import type { NotificationQueueMessage } from './lib/server/modules/notifications/outbox/outbox.types';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

/*
 * R2Bucket is NOT imported here. It is a global type, merged into the ambient
 * scope by `@cloudflare/workers-types` via the `types` array in tsconfig.json.
 *
 * Importing it (e.g. `import type { R2Bucket } from '@cloudflare/workers-types'`)
 * creates a separate module-scoped type identity that TypeScript treats as
 * structurally incompatible with the global — causing TS2345 mismatches in
 * any .ts file that uses the global R2Bucket directly (e.g. r2.ts).
 */

declare global {
	namespace App {
		interface Platform {
			env: {
				MEDIA: R2Bucket;
				OTP_COOLDOWNS: KVNamespace;
				NOTIFICATION_QUEUE: Queue<NotificationQueueMessage>;
			};
			cf: CfProperties;
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}

		interface Locals {
			user?: User;
			session?: Session;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
