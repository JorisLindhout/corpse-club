// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Preview } from '$lib/seo';

declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			deviceId: string;
		}

		// interface Error {}
		interface PageData {
			preview?: Preview;
		}
		// interface PageState {}
	}
}

export {};
