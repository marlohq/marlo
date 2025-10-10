/// <reference types="astro/client" />
/// <reference types="@total-typescript/ts-reset" />

declare namespace App {
	interface Locals {
		claims: import('./lib/auth').UserJWTPayload | Record<string, never>;
		_currentAccount:
			| (import('@workspace/core/drizzle.js').InferSelectModel<
					typeof import('@workspace/core/drizzle.js').account
			  > & {
					user: import('@workspace/core/drizzle.js').InferSelectModel<
						typeof import('@workspace/core/drizzle.js').user
					>;
			  })
			| null;
		currentAccount: () => Promise<
			| (import('@workspace/core/drizzle.js').InferSelectModel<
					typeof import('@workspace/core/drizzle.js').account
			  > & {
					user: import('@workspace/core/drizzle.js').InferSelectModel<
						typeof import('@workspace/core/drizzle.js').user
					>;
			  })
			| null
		>;
	}
}
