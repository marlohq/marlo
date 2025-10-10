import { createRoarrSentryIntegration } from '@roarr/sentry';
import * as Sentry from '@sentry/node';
import { type JsonObjectWithErrorSupport, logger } from '@workspace/core/logger.js';
import { SENTRY_DSN } from './env.ts';

Error.stackTraceLimit = 50;
Sentry.init({
	dsn: SENTRY_DSN,
	enabled: process.env.NODE_ENV === 'production' && Boolean(SENTRY_DSN),
	integrations: [
		createRoarrSentryIntegration({
			addBreadcrumb: (breadcrumb) => {
				Sentry.addBreadcrumb(breadcrumb);
			},
		}),
	],
	normalizeDepth: 5,
});

export function captureUserContext(user: { id: string; email?: string; name?: string }) {
	// Sentry manages its own request scope isolation for us. This is a bit of magic though, so if we
	// ever need to we can manage it ourselves with Sentry.withIsolationScope() in `middleware.ts`.
	// See https://docs.sentry.io/platforms/javascript/guides/node/enriching-events/request-isolation/
	Sentry.setUser({
		id: user.id,
		email: user.email,
		username: user.name,
	});
}

export function captureException(contextWithError: JsonObjectWithErrorSupport, message: string) {
	// Log the error to console, Axiom, etc.
	logger.error(contextWithError, message);
	// Log the error to Sentry.
	const error: unknown = contextWithError.error ?? new Error('Unknown Error!');
	Sentry.captureException(error, (scope) => {
		scope.setContext('logger', logger.getContext());
		return scope;
	});
}
